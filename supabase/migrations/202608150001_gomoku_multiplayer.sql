-- 联机五子棋：公开棋局状态、私有玩家凭证、原子落子 RPC 与实时同步。
create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.gomoku_empty_board()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_agg(0 order by position)
  from generate_series(0, 224) as positions(position);
$$;

create table if not exists public.gomoku_games (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-Z2-9]{6}$'),
  board jsonb not null default private.gomoku_empty_board(),
  status text not null default 'waiting'
    check (status in ('waiting', 'playing', 'black_won', 'white_won', 'draw')),
  current_turn smallint not null default 1 check (current_turn in (1, 2)),
  winner smallint check (winner in (1, 2)),
  black_name text not null check (char_length(black_name) between 1 and 20),
  white_name text check (white_name is null or char_length(white_name) between 1 and 20),
  move_count integer not null default 0 check (move_count between 0 and 225),
  last_move jsonb,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint gomoku_board_is_array check (
    jsonb_typeof(board) = 'array' and jsonb_array_length(board) = 225
  )
);

create index if not exists gomoku_games_expires_at_idx
  on public.gomoku_games (expires_at);

create table if not exists private.gomoku_players (
  game_id uuid not null references public.gomoku_games(id) on delete cascade,
  color smallint not null check (color in (1, 2)),
  token_hash bytea not null,
  joined_at timestamptz not null default now(),
  primary key (game_id, color),
  unique (game_id, token_hash)
);

alter table public.gomoku_games enable row level security;
revoke all on public.gomoku_games from anon, authenticated;
grant select on public.gomoku_games to anon, authenticated;

drop policy if exists "查看有效五子棋房间" on public.gomoku_games;
create policy "查看有效五子棋房间"
on public.gomoku_games
for select
to anon, authenticated
using (expires_at > now());

create or replace function private.gomoku_token_hash(p_token text)
returns bytea
language sql
immutable
strict
set search_path = ''
as $$
  select extensions.digest(convert_to(p_token, 'UTF8'), 'sha256');
$$;

create or replace function private.gomoku_random_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32)::integer + 1, 1),
    '' order by position
  )
  from generate_series(1, 6) as positions(position);
$$;

create or replace function private.gomoku_safe_game(p_game public.gomoku_games)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_game.id,
    'roomCode', p_game.room_code,
    'board', p_game.board,
    'status', p_game.status,
    'currentTurn', p_game.current_turn,
    'winner', p_game.winner,
    'blackName', p_game.black_name,
    'whiteName', p_game.white_name,
    'moveCount', p_game.move_count,
    'lastMove', p_game.last_move,
    'version', p_game.version,
    'updatedAt', p_game.updated_at,
    'expiresAt', p_game.expires_at
  );
$$;

create or replace function private.gomoku_has_five(
  p_board jsonb,
  p_row integer,
  p_col integer,
  p_color smallint
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_direction record;
  v_step integer;
  v_row integer;
  v_col integer;
  v_count integer;
begin
  for v_direction in
    select * from (values (1, 0), (0, 1), (1, 1), (1, -1)) as directions(dr, dc)
  loop
    v_count := 1;

    for v_step in 1..4 loop
      v_row := p_row + v_direction.dr * v_step;
      v_col := p_col + v_direction.dc * v_step;
      exit when v_row < 0 or v_row >= 15 or v_col < 0 or v_col >= 15;
      exit when coalesce((p_board ->> (v_row * 15 + v_col))::smallint, 0) <> p_color;
      v_count := v_count + 1;
    end loop;

    for v_step in 1..4 loop
      v_row := p_row - v_direction.dr * v_step;
      v_col := p_col - v_direction.dc * v_step;
      exit when v_row < 0 or v_row >= 15 or v_col < 0 or v_col >= 15;
      exit when coalesce((p_board ->> (v_row * 15 + v_col))::smallint, 0) <> p_color;
      v_count := v_count + 1;
    end loop;

    if v_count >= 5 then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

create or replace function public.gomoku_create_game(
  p_player_name text,
  p_player_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_player_name, ''));
  v_code text;
  v_game public.gomoku_games;
  v_attempt integer;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 20 then
    raise exception '昵称需要填写 1 到 20 个字符';
  end if;
  if char_length(coalesce(p_player_token, '')) < 20 or char_length(p_player_token) > 128 then
    raise exception '玩家凭证无效，请刷新页面后重试';
  end if;

  delete from public.gomoku_games
  where id in (
    select id from public.gomoku_games
    where expires_at <= now()
    order by expires_at
    limit 100
  );

  for v_attempt in 1..12 loop
    v_code := private.gomoku_random_code();
    begin
      insert into public.gomoku_games (room_code, black_name)
      values (v_code, v_name)
      returning * into v_game;
      exit;
    exception when unique_violation then
      v_game := null;
    end;
  end loop;

  if v_game.id is null then
    raise exception '房间码生成失败，请稍后重试';
  end if;

  insert into private.gomoku_players (game_id, color, token_hash)
  values (v_game.id, 1, private.gomoku_token_hash(p_player_token));

  return jsonb_build_object(
    'game', private.gomoku_safe_game(v_game),
    'playerColor', 1
  );
end;
$$;

create or replace function public.gomoku_join_game(
  p_room_code text,
  p_player_name text,
  p_player_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(btrim(coalesce(p_room_code, '')));
  v_name text := btrim(coalesce(p_player_name, ''));
  v_game public.gomoku_games;
  v_color smallint;
begin
  if v_code !~ '^[A-Z2-9]{6}$' then
    raise exception '请输入正确的 6 位房间码';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 20 then
    raise exception '昵称需要填写 1 到 20 个字符';
  end if;
  if char_length(coalesce(p_player_token, '')) < 20 or char_length(p_player_token) > 128 then
    raise exception '玩家凭证无效，请刷新页面后重试';
  end if;

  select * into v_game
  from public.gomoku_games
  where room_code = v_code and expires_at > now()
  for update;

  if not found then
    raise exception '房间不存在或已经过期';
  end if;

  select color into v_color
  from private.gomoku_players
  where game_id = v_game.id
    and token_hash = private.gomoku_token_hash(p_player_token);

  if v_color is not null then
    return jsonb_build_object(
      'game', private.gomoku_safe_game(v_game),
      'playerColor', v_color
    );
  end if;

  if v_game.white_name is not null or v_game.status <> 'waiting' then
    raise exception '房间已经坐满';
  end if;

  insert into private.gomoku_players (game_id, color, token_hash)
  values (v_game.id, 2, private.gomoku_token_hash(p_player_token));

  update public.gomoku_games
  set white_name = v_name,
      status = 'playing',
      updated_at = now(),
      expires_at = now() + interval '24 hours',
      version = version + 1
  where id = v_game.id
  returning * into v_game;

  return jsonb_build_object(
    'game', private.gomoku_safe_game(v_game),
    'playerColor', 2
  );
end;
$$;

create or replace function public.gomoku_get_game(
  p_room_code text,
  p_player_token text default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_game public.gomoku_games;
  v_color smallint;
begin
  select * into v_game
  from public.gomoku_games
  where room_code = upper(btrim(coalesce(p_room_code, '')))
    and expires_at > now();

  if not found then
    raise exception '房间不存在或已经过期';
  end if;

  if p_player_token is not null then
    select color into v_color
    from private.gomoku_players
    where game_id = v_game.id
      and token_hash = private.gomoku_token_hash(p_player_token);
  end if;

  return jsonb_build_object(
    'game', private.gomoku_safe_game(v_game),
    'playerColor', v_color
  );
end;
$$;

create or replace function public.gomoku_make_move(
  p_room_code text,
  p_player_token text,
  p_row integer,
  p_col integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.gomoku_games;
  v_color smallint;
  v_index integer;
  v_board jsonb;
  v_status text;
  v_winner smallint;
  v_move_count integer;
begin
  if p_row < 0 or p_row >= 15 or p_col < 0 or p_col >= 15 then
    raise exception '落子位置无效';
  end if;

  select * into v_game
  from public.gomoku_games
  where room_code = upper(btrim(coalesce(p_room_code, '')))
    and expires_at > now()
  for update;

  if not found then
    raise exception '房间不存在或已经过期';
  end if;
  if v_game.status <> 'playing' then
    raise exception '当前棋局不能落子';
  end if;

  select color into v_color
  from private.gomoku_players
  where game_id = v_game.id
    and token_hash = private.gomoku_token_hash(p_player_token);

  if v_color is null then
    raise exception '你不是这个房间的玩家';
  end if;
  if v_color <> v_game.current_turn then
    raise exception '还没有轮到你落子';
  end if;

  v_index := p_row * 15 + p_col;
  if coalesce((v_game.board ->> v_index)::smallint, 0) <> 0 then
    raise exception '这个位置已经有棋子了';
  end if;

  v_board := jsonb_set(v_game.board, array[v_index::text], to_jsonb(v_color), false);
  v_move_count := v_game.move_count + 1;
  v_status := 'playing';
  v_winner := null;

  if private.gomoku_has_five(v_board, p_row, p_col, v_color) then
    v_status := case when v_color = 1 then 'black_won' else 'white_won' end;
    v_winner := v_color;
  elsif v_move_count >= 225 then
    v_status := 'draw';
  end if;

  update public.gomoku_games
  set board = v_board,
      status = v_status,
      winner = v_winner,
      current_turn = case when v_status = 'playing' then 3 - v_color else v_color end,
      move_count = v_move_count,
      last_move = jsonb_build_object('row', p_row, 'col', p_col, 'color', v_color),
      updated_at = now(),
      expires_at = now() + interval '24 hours',
      version = version + 1
  where id = v_game.id
  returning * into v_game;

  return jsonb_build_object(
    'game', private.gomoku_safe_game(v_game),
    'playerColor', v_color
  );
end;
$$;

create or replace function public.gomoku_restart_game(
  p_room_code text,
  p_player_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.gomoku_games;
  v_color smallint;
begin
  select * into v_game
  from public.gomoku_games
  where room_code = upper(btrim(coalesce(p_room_code, '')))
    and expires_at > now()
  for update;

  if not found then
    raise exception '房间不存在或已经过期';
  end if;

  select color into v_color
  from private.gomoku_players
  where game_id = v_game.id
    and token_hash = private.gomoku_token_hash(p_player_token);

  if v_color <> 1 then
    raise exception '只有房主可以重新开始';
  end if;

  update public.gomoku_games
  set board = private.gomoku_empty_board(),
      status = case when white_name is null then 'waiting' else 'playing' end,
      current_turn = 1,
      winner = null,
      move_count = 0,
      last_move = null,
      updated_at = now(),
      expires_at = now() + interval '24 hours',
      version = version + 1
  where id = v_game.id
  returning * into v_game;

  return jsonb_build_object(
    'game', private.gomoku_safe_game(v_game),
    'playerColor', 1
  );
end;
$$;

revoke all on function public.gomoku_create_game(text, text) from public;
revoke all on function public.gomoku_join_game(text, text, text) from public;
revoke all on function public.gomoku_get_game(text, text) from public;
revoke all on function public.gomoku_make_move(text, text, integer, integer) from public;
revoke all on function public.gomoku_restart_game(text, text) from public;

grant execute on function public.gomoku_create_game(text, text) to anon, authenticated;
grant execute on function public.gomoku_join_game(text, text, text) to anon, authenticated;
grant execute on function public.gomoku_get_game(text, text) to anon, authenticated;
grant execute on function public.gomoku_make_move(text, text, integer, integer) to anon, authenticated;
grant execute on function public.gomoku_restart_game(text, text) to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gomoku_games'
  ) then
    alter publication supabase_realtime add table public.gomoku_games;
  end if;
end;
$$;

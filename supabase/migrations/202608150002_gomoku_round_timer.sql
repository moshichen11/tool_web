-- 五子棋第二次升级：服务器回合计时、超时判负、双方确认再来一局、自动换边和退出房间。
-- 请在 202608150001_gomoku_multiplayer.sql 成功执行后运行本文件。

alter table public.gomoku_games
  add column if not exists turn_seconds integer not null default 60,
  add column if not exists turn_deadline timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists finish_reason text,
  add column if not exists round_number integer not null default 1,
  add column if not exists black_seat smallint not null default 1,
  add column if not exists seat1_ready boolean not null default false,
  add column if not exists seat2_ready boolean not null default false,
  add column if not exists closed_by_seat smallint;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'private' and table_name = 'gomoku_players' and column_name = 'color'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'private' and table_name = 'gomoku_players' and column_name = 'seat'
  ) then
    alter table private.gomoku_players rename column color to seat;
  end if;
end;
$$;

alter table public.gomoku_games drop constraint if exists gomoku_games_status_check;
alter table public.gomoku_games drop constraint if exists gomoku_games_turn_seconds_check;
alter table public.gomoku_games drop constraint if exists gomoku_games_round_number_check;
alter table public.gomoku_games drop constraint if exists gomoku_games_black_seat_check;
alter table public.gomoku_games drop constraint if exists gomoku_games_finish_reason_check;
alter table public.gomoku_games drop constraint if exists gomoku_games_closed_by_seat_check;

alter table public.gomoku_games
  add constraint gomoku_games_status_check
    check (status in ('waiting', 'playing', 'black_won', 'white_won', 'draw', 'closed')),
  add constraint gomoku_games_turn_seconds_check
    check (turn_seconds between 10 and 600),
  add constraint gomoku_games_round_number_check
    check (round_number >= 1),
  add constraint gomoku_games_black_seat_check
    check (black_seat in (1, 2)),
  add constraint gomoku_games_finish_reason_check
    check (finish_reason is null or finish_reason in ('five', 'timeout', 'draw', 'player_exit')),
  add constraint gomoku_games_closed_by_seat_check
    check (closed_by_seat is null or closed_by_seat in (1, 2));

create or replace function private.gomoku_safe_game(p_game public.gomoku_games)
returns jsonb
language sql
volatile
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
    'turnSeconds', p_game.turn_seconds,
    'turnDeadline', p_game.turn_deadline,
    'startedAt', p_game.started_at,
    'finishReason', p_game.finish_reason,
    'roundNumber', p_game.round_number,
    'blackSeat', p_game.black_seat,
    'seat1Ready', p_game.seat1_ready,
    'seat2Ready', p_game.seat2_ready,
    'closedBySeat', p_game.closed_by_seat,
    'updatedAt', p_game.updated_at,
    'expiresAt', p_game.expires_at,
    'serverNow', clock_timestamp()
  );
$$;

drop function if exists public.gomoku_create_game(text, text);
create or replace function public.gomoku_create_game(
  p_player_name text,
  p_player_token text,
  p_turn_seconds integer default 60
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
  if p_turn_seconds is null or p_turn_seconds < 10 or p_turn_seconds > 600 then
    raise exception '每步时间需要设置为 10 到 600 秒';
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
      insert into public.gomoku_games (
        room_code, black_name, turn_seconds, black_seat,
        turn_deadline, started_at, finish_reason, round_number,
        seat1_ready, seat2_ready, closed_by_seat
      ) values (
        v_code, v_name, p_turn_seconds, 1,
        null, null, null, 1,
        false, false, null
      )
      returning * into v_game;
      exit;
    exception when unique_violation then
      v_game := null;
    end;
  end loop;

  if v_game.id is null then
    raise exception '房间码生成失败，请稍后重试';
  end if;

  insert into private.gomoku_players (game_id, seat, token_hash)
  values (v_game.id, 1, private.gomoku_token_hash(p_player_token));

  return jsonb_build_object(
    'game', private.gomoku_safe_game(v_game),
    'playerSeat', 1
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
  v_seat smallint;
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

  if not found or v_game.status = 'closed' then
    raise exception '房间不存在或已经关闭';
  end if;

  select seat into v_seat
  from private.gomoku_players
  where game_id = v_game.id
    and token_hash = private.gomoku_token_hash(p_player_token);

  if v_seat is not null then
    return jsonb_build_object(
      'game', private.gomoku_safe_game(v_game),
      'playerSeat', v_seat
    );
  end if;

  if v_game.white_name is not null or v_game.status <> 'waiting' then
    raise exception '房间已经坐满';
  end if;

  insert into private.gomoku_players (game_id, seat, token_hash)
  values (v_game.id, 2, private.gomoku_token_hash(p_player_token));

  update public.gomoku_games
  set white_name = v_name,
      status = 'playing',
      turn_deadline = null,
      started_at = null,
      finish_reason = null,
      updated_at = clock_timestamp(),
      expires_at = clock_timestamp() + interval '24 hours',
      version = version + 1
  where id = v_game.id
  returning * into v_game;

  return jsonb_build_object(
    'game', private.gomoku_safe_game(v_game),
    'playerSeat', 2
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
set search_path = ''
as $$
declare
  v_game public.gomoku_games;
  v_seat smallint;
begin
  select * into v_game
  from public.gomoku_games
  where room_code = upper(btrim(coalesce(p_room_code, '')))
    and expires_at > now();

  if not found then
    raise exception '房间不存在或已经过期';
  end if;

  if p_player_token is not null then
    select seat into v_seat
    from private.gomoku_players
    where game_id = v_game.id
      and token_hash = private.gomoku_token_hash(p_player_token);
  end if;

  return jsonb_build_object(
    'game', private.gomoku_safe_game(v_game),
    'playerSeat', v_seat
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
  v_seat smallint;
  v_color smallint;
  v_index integer;
  v_board jsonb;
  v_status text;
  v_winner smallint;
  v_move_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_row < 0 or p_row >= 15 or p_col < 0 or p_col >= 15 then
    raise exception '落子位置无效';
  end if;

  select * into v_game
  from public.gomoku_games
  where room_code = upper(btrim(coalesce(p_room_code, '')))
    and expires_at > now()
  for update;

  if not found or v_game.status = 'closed' then
    raise exception '房间不存在或已经关闭';
  end if;
  if v_game.status <> 'playing' then
    raise exception '当前棋局不能落子';
  end if;

  select seat into v_seat
  from private.gomoku_players
  where game_id = v_game.id
    and token_hash = private.gomoku_token_hash(p_player_token);

  if v_seat is null then
    raise exception '你不是这个房间的玩家';
  end if;

  v_color := case when v_seat = v_game.black_seat then 1 else 2 end;

  if v_game.turn_deadline is not null and v_now >= v_game.turn_deadline then
    v_winner := 3 - v_game.current_turn;
    update public.gomoku_games
    set status = case when v_winner = 1 then 'black_won' else 'white_won' end,
        winner = v_winner,
        finish_reason = 'timeout',
        turn_deadline = null,
        seat1_ready = false,
        seat2_ready = false,
        updated_at = v_now,
        version = version + 1
    where id = v_game.id
    returning * into v_game;

    return jsonb_build_object(
      'game', private.gomoku_safe_game(v_game),
      'playerSeat', v_seat
    );
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
      started_at = coalesce(started_at, v_now),
      turn_deadline = case
        when v_status = 'playing' then v_now + make_interval(secs => v_game.turn_seconds)
        else null
      end,
      finish_reason = case
        when v_status in ('black_won', 'white_won') then 'five'
        when v_status = 'draw' then 'draw'
        else null
      end,
      seat1_ready = false,
      seat2_ready = false,
      updated_at = v_now,
      expires_at = v_now + interval '24 hours',
      version = version + 1
  where id = v_game.id
  returning * into v_game;

  return jsonb_build_object(
    'game', private.gomoku_safe_game(v_game),
    'playerSeat', v_seat
  );
end;
$$;

create or replace function public.gomoku_claim_timeout(
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
  v_seat smallint;
  v_winner smallint;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_game
  from public.gomoku_games
  where room_code = upper(btrim(coalesce(p_room_code, '')))
    and expires_at > now()
  for update;

  if not found or v_game.status = 'closed' then
    raise exception '房间不存在或已经关闭';
  end if;

  select seat into v_seat
  from private.gomoku_players
  where game_id = v_game.id
    and token_hash = private.gomoku_token_hash(p_player_token);

  if v_seat is null then
    raise exception '你不是这个房间的玩家';
  end if;
  if v_game.status <> 'playing' then
    return jsonb_build_object('game', private.gomoku_safe_game(v_game), 'playerSeat', v_seat);
  end if;
  if v_game.turn_deadline is null or v_now < v_game.turn_deadline then
    raise exception '本回合尚未超时';
  end if;

  v_winner := 3 - v_game.current_turn;
  update public.gomoku_games
  set status = case when v_winner = 1 then 'black_won' else 'white_won' end,
      winner = v_winner,
      finish_reason = 'timeout',
      turn_deadline = null,
      seat1_ready = false,
      seat2_ready = false,
      updated_at = v_now,
      version = version + 1
  where id = v_game.id
  returning * into v_game;

  return jsonb_build_object(
    'game', private.gomoku_safe_game(v_game),
    'playerSeat', v_seat
  );
end;
$$;

create or replace function public.gomoku_request_rematch(
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
  v_seat smallint;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_game
  from public.gomoku_games
  where room_code = upper(btrim(coalesce(p_room_code, '')))
    and expires_at > now()
  for update;

  if not found or v_game.status = 'closed' then
    raise exception '房间不存在或已经关闭';
  end if;

  select seat into v_seat
  from private.gomoku_players
  where game_id = v_game.id
    and token_hash = private.gomoku_token_hash(p_player_token);

  if v_seat is null then
    raise exception '你不是这个房间的玩家';
  end if;
  if v_game.status not in ('black_won', 'white_won', 'draw') then
    raise exception '本局尚未结束';
  end if;

  update public.gomoku_games
  set seat1_ready = seat1_ready or (v_seat = 1),
      seat2_ready = seat2_ready or (v_seat = 2),
      updated_at = v_now,
      version = version + 1
  where id = v_game.id
  returning * into v_game;

  if v_game.seat1_ready and v_game.seat2_ready then
    update public.gomoku_games
    set board = private.gomoku_empty_board(),
        status = 'playing',
        current_turn = 1,
        winner = null,
        black_name = v_game.white_name,
        white_name = v_game.black_name,
        move_count = 0,
        last_move = null,
        turn_deadline = null,
        started_at = null,
        finish_reason = null,
        round_number = round_number + 1,
        black_seat = 3 - black_seat,
        seat1_ready = false,
        seat2_ready = false,
        closed_by_seat = null,
        updated_at = v_now,
        expires_at = v_now + interval '24 hours',
        version = version + 1
    where id = v_game.id
    returning * into v_game;
  end if;

  return jsonb_build_object(
    'game', private.gomoku_safe_game(v_game),
    'playerSeat', v_seat
  );
end;
$$;

create or replace function public.gomoku_exit_game(
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
  v_seat smallint;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_game
  from public.gomoku_games
  where room_code = upper(btrim(coalesce(p_room_code, '')))
    and expires_at > now()
  for update;

  if not found then
    raise exception '房间不存在或已经过期';
  end if;

  select seat into v_seat
  from private.gomoku_players
  where game_id = v_game.id
    and token_hash = private.gomoku_token_hash(p_player_token);

  if v_seat is null then
    raise exception '你不是这个房间的玩家';
  end if;

  if v_game.status <> 'closed' then
    update public.gomoku_games
    set status = 'closed',
        winner = null,
        finish_reason = 'player_exit',
        closed_by_seat = v_seat,
        turn_deadline = null,
        seat1_ready = false,
        seat2_ready = false,
        updated_at = v_now,
        version = version + 1
    where id = v_game.id
    returning * into v_game;
  end if;

  return jsonb_build_object(
    'game', private.gomoku_safe_game(v_game),
    'playerSeat', v_seat
  );
end;
$$;

drop function if exists public.gomoku_restart_game(text, text);

revoke all on function public.gomoku_create_game(text, text, integer) from public;
revoke all on function public.gomoku_join_game(text, text, text) from public;
revoke all on function public.gomoku_get_game(text, text) from public;
revoke all on function public.gomoku_make_move(text, text, integer, integer) from public;
revoke all on function public.gomoku_claim_timeout(text, text) from public;
revoke all on function public.gomoku_request_rematch(text, text) from public;
revoke all on function public.gomoku_exit_game(text, text) from public;

grant execute on function public.gomoku_create_game(text, text, integer) to anon, authenticated;
grant execute on function public.gomoku_join_game(text, text, text) to anon, authenticated;
grant execute on function public.gomoku_get_game(text, text) to anon, authenticated;
grant execute on function public.gomoku_make_move(text, text, integer, integer) to anon, authenticated;
grant execute on function public.gomoku_claim_timeout(text, text) to anon, authenticated;
grant execute on function public.gomoku_request_rematch(text, text) to anon, authenticated;
grant execute on function public.gomoku_exit_game(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- 账号资料与个人数据同步。请在 Supabase SQL Editor 中完整执行一次。

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 20),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_app_state enable row level security;

revoke all on public.profiles from anon;
revoke all on public.user_app_state from anon;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.user_app_state to authenticated;

drop policy if exists "用户查看自己的资料" on public.profiles;
create policy "用户查看自己的资料" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "用户新增自己的资料" on public.profiles;
create policy "用户新增自己的资料" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "用户修改自己的资料" on public.profiles;
create policy "用户修改自己的资料" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "用户删除自己的资料" on public.profiles;
create policy "用户删除自己的资料" on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);

drop policy if exists "用户查看自己的应用数据" on public.user_app_state;
create policy "用户查看自己的应用数据" on public.user_app_state
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "用户新增自己的应用数据" on public.user_app_state;
create policy "用户新增自己的应用数据" on public.user_app_state
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "用户修改自己的应用数据" on public.user_app_state;
create policy "用户修改自己的应用数据" on public.user_app_state
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "用户删除自己的应用数据" on public.user_app_state;
create policy "用户删除自己的应用数据" on public.user_app_state
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  initial_name text;
begin
  initial_name := left(coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    '用户'
  ), 20);
  insert into public.profiles (id, nickname)
  values (new.id, initial_name)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

insert into public.profiles (id, nickname)
select id, left(coalesce(nullif(split_part(coalesce(email, ''), '@', 1), ''), '用户'), 20)
from auth.users
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "用户查看自己的头像" on storage.objects;
create policy "用户查看自己的头像" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "用户上传自己的头像" on storage.objects;
create policy "用户上传自己的头像" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "用户更新自己的头像" on storage.objects;
create policy "用户更新自己的头像" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "用户删除自己的头像" on storage.objects;
create policy "用户删除自己的头像" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

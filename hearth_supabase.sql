-- Hearth Cloud backend
-- Run this entire file in Supabase SQL Editor before putting the project URL
-- and publishable key into index 2.html.

create extension if not exists pgcrypto;

create table if not exists public.mods (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  author text not null,
  platform text not null check (platform in ('java','bedrock')),
  description text not null,
  version text not null,
  loader text not null,
  categories text[] not null default '{}',
  icon_url text,
  file_url text,
  file_path text,
  file_name text,
  file_size bigint not null default 0,
  downloads bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.servers (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  platform text not null check (platform in ('java','bedrock')),
  ip text not null,
  port text,
  description text not null,
  mode text not null,
  players text not null,
  version text not null,
  likes bigint not null default 0,
  dislikes bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  mod_id text not null references public.mods(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author text not null,
  stars integer not null check (stars between 1 and 5),
  text text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.server_votes (
  server_id text not null references public.servers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote text not null check (vote in ('like','dislike')),
  created_at timestamptz not null default now(),
  primary key (server_id,user_id)
);

create index if not exists mods_owner_id_idx on public.mods(owner_id);
create index if not exists mods_created_at_idx on public.mods(created_at desc);
create index if not exists servers_owner_id_idx on public.servers(owner_id);
create index if not exists servers_created_at_idx on public.servers(created_at desc);
create index if not exists reviews_mod_id_idx on public.reviews(mod_id);
create index if not exists server_votes_server_id_idx on public.server_votes(server_id);
create index if not exists server_votes_user_id_idx on public.server_votes(user_id);

alter table public.mods enable row level security;
alter table public.servers enable row level security;
alter table public.reviews enable row level security;
alter table public.server_votes enable row level security;

-- Public browsing.
drop policy if exists "mods_public_read" on public.mods;
create policy "mods_public_read" on public.mods for select to anon, authenticated using (true);

drop policy if exists "servers_public_read" on public.servers;
create policy "servers_public_read" on public.servers for select to anon, authenticated using (true);

drop policy if exists "reviews_public_read" on public.reviews;
create policy "reviews_public_read" on public.reviews for select to anon, authenticated using (true);

-- Mod ownership.
drop policy if exists "mods_owner_insert" on public.mods;
create policy "mods_owner_insert" on public.mods for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "mods_owner_update" on public.mods;
create policy "mods_owner_update" on public.mods for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "mods_owner_delete" on public.mods;
create policy "mods_owner_delete" on public.mods for delete to authenticated
using ((select auth.uid()) = owner_id);

-- Server ownership.
drop policy if exists "servers_owner_insert" on public.servers;
create policy "servers_owner_insert" on public.servers for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "servers_owner_update" on public.servers;
create policy "servers_owner_update" on public.servers for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "servers_owner_delete" on public.servers;
create policy "servers_owner_delete" on public.servers for delete to authenticated
using ((select auth.uid()) = owner_id);

-- Reviews.
drop policy if exists "reviews_user_insert" on public.reviews;
create policy "reviews_user_insert" on public.reviews for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "reviews_user_update" on public.reviews;
create policy "reviews_user_update" on public.reviews for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "reviews_user_delete" on public.reviews;
create policy "reviews_user_delete" on public.reviews for delete to authenticated
using ((select auth.uid()) = user_id);

-- Vote rows are private to the voter. Counts are exposed through servers.
drop policy if exists "votes_user_read" on public.server_votes;
create policy "votes_user_read" on public.server_votes for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "votes_user_insert" on public.server_votes;
create policy "votes_user_insert" on public.server_votes for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "votes_user_delete" on public.server_votes;
create policy "votes_user_delete" on public.server_votes for delete to authenticated
using ((select auth.uid()) = user_id);

-- Atomic server voting. The browser never gets permission to rewrite another
-- user's vote or directly forge the aggregate counts.
create or replace function public.set_server_vote(p_server_id text, p_vote text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_vote is not null and p_vote not in ('like','dislike') then raise exception 'Invalid vote'; end if;

  delete from public.server_votes where server_id = p_server_id and user_id = uid;
  if p_vote is not null then
    insert into public.server_votes(server_id,user_id,vote) values(p_server_id,uid,p_vote);
  end if;

  update public.servers s
  set likes = (select count(*) from public.server_votes v where v.server_id=s.id and v.vote='like'),
      dislikes = (select count(*) from public.server_votes v where v.server_id=s.id and v.vote='dislike')
  where s.id = p_server_id;
end;
$$;

grant execute on function public.set_server_vote(text,text) to authenticated;

-- Atomic download counter.
create or replace function public.increment_mod_downloads(mod_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.mods set downloads = downloads + 1 where id = mod_id;
$$;

grant execute on function public.increment_mod_downloads(text) to authenticated;

-- Public bucket for downloadable mod files and icons. RLS controls uploads.
insert into storage.buckets (id,name,public)
values ('mod-files','mod-files',true)
on conflict (id) do update set public=true;

-- Anyone can download published files.
drop policy if exists "mod_files_public_read" on storage.objects;
create policy "mod_files_public_read" on storage.objects
for select to anon, authenticated
using (bucket_id = 'mod-files');

-- Signed-in users may upload only under their own user-id directory.
drop policy if exists "mod_files_user_insert" on storage.objects;
create policy "mod_files_user_insert" on storage.objects
for insert to authenticated
with check (bucket_id='mod-files' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists "mod_files_user_update" on storage.objects;
create policy "mod_files_user_update" on storage.objects
for update to authenticated
using (bucket_id='mod-files' and owner_id=(select auth.uid())::text)
with check (bucket_id='mod-files' and owner_id=(select auth.uid())::text);

drop policy if exists "mod_files_user_delete" on storage.objects;
create policy "mod_files_user_delete" on storage.objects
for delete to authenticated
using (bucket_id='mod-files' and owner_id=(select auth.uid())::text);

-- Supabase's Data API needs table grants in addition to RLS.
grant select on public.mods, public.servers, public.reviews to anon, authenticated;
grant insert, update, delete on public.mods, public.servers, public.reviews to authenticated;
grant select on public.server_votes to authenticated;
grant insert, delete on public.server_votes to authenticated;

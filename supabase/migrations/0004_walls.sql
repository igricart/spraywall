-- 0004: the wall (photo + hold map) lives in the database; admins publish it from the app.
-- Paste into Supabase: SQL Editor -> New query -> Run.

-- Who may publish the wall. Add people with:
--   insert into public.admins select id from auth.users where email = 'someone@gmail.com';
-- (they must have signed in with Google once first)
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
create policy "see own admin row" on public.admins for select to authenticated
  using (user_id = auth.uid());

-- Every publish adds a row; the app shows the newest one. version only goes up with a new photo,
-- so routes made on an older photo get the "old wall" tag.
create table public.walls (
  id bigint generated always as identity primary key,
  version int not null check (version > 0),
  photo_url text not null check (char_length(photo_url) < 500),
  holds jsonb not null check (jsonb_typeof(holds) = 'array' and pg_column_size(holds) < 200000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.walls enable row level security;
create policy "anyone can read walls" on public.walls for select using (true);
create policy "admins publish walls" on public.walls for insert to authenticated
  with check (exists (select 1 from public.admins where user_id = auth.uid()));

-- Wall photos: public to read, only admins upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('walls', 'walls', true, 5242880, array['image/jpeg']);
create policy "admins upload wall photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'walls' and exists (select 1 from public.admins where user_id = auth.uid())
  );

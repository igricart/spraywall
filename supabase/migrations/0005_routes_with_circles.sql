-- 0005: model B (docs/SPEC.md). Every route carries its own circles; no shared hold map.
-- Anyone creates routes; signed-in users update/delete any route, and every change first copies
-- the old version into route_backups. Signed-in users change the wall photo.
-- Paste into Supabase: SQL Editor -> New query -> Run.

-- old test route (made on the home-wall photo with id-based holds)
delete from public.routes;

-- holds is now [{"x":0.5,"y":0.31,"r":0.018,"t":"s"}, ...]
alter table public.routes drop constraint routes_holds_check;
alter table public.routes add constraint routes_holds_check check (
  jsonb_typeof(holds) = 'array'
  and jsonb_array_length(holds) between 1 and 80
  and pg_column_size(holds) < 16000
);

-- backup of every version that gets changed or deleted (restore from the dashboard)
create table public.route_backups (
  id bigint generated always as identity primary key,
  route_id bigint not null,
  action text not null check (action in ('update', 'delete')),
  old jsonb not null,                       -- the whole route row before the change
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
alter table public.route_backups enable row level security; -- no policies: dashboard only

create function public.backup_route() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.route_backups (route_id, action, old)
  values (old.id, lower(tg_op), to_jsonb(old));
  return coalesce(new, old);
end $$;
create trigger backup_route before update or delete on public.routes
  for each row execute function public.backup_route();

create policy "signed-in users update routes" on public.routes for update to authenticated
  using (not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) with check (true);
create policy "signed-in users delete routes" on public.routes for delete to authenticated
  using (not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false));

-- wall photo: any signed-in user (the admin list is gone)
drop policy "admins publish walls" on public.walls;
create policy "signed-in users change the photo" on public.walls for insert to authenticated
  with check (not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false));
drop policy "admins upload wall photos" on storage.objects;
create policy "signed-in users upload wall photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'walls');
drop table public.admins;

-- Shared route list. Paste into Supabase: SQL Editor -> New query -> Run.
create table public.routes (
  id bigint generated always as identity primary key,
  wall int not null,                                   -- hold-map version the hold ids belong to
  name text not null check (char_length(name) between 1 and 60),
  grade text check (char_length(grade) <= 10),
  setter text check (char_length(setter) <= 40),
  feet text not null default 'm' check (feet in ('m', 'a', 'h', 'n')),
  holds jsonb not null                                 -- {"12": "s", "40": "h", ...}
    check (jsonb_typeof(holds) = 'object' and pg_column_size(holds) < 4000),
  created_at timestamptz not null default now()
);

-- No login yet: anyone with the app can read and add routes.
-- Nobody can edit or delete through the app; the admin does that in the Supabase dashboard.
alter table public.routes enable row level security;
create policy "anyone can read routes" on public.routes for select using (true);
create policy "anyone can add routes" on public.routes for insert with check (true);

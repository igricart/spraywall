-- 0002: grades as numbers, ascents (sends with optional grade vote + 1-3 stars), consensus view.
-- Paste into Supabase: SQL Editor -> New query -> Run.

-- Grade = index into the Font scale (see src/lib/grades.js); V votes may land on .5 steps.
alter table public.routes add column difficulty numeric(3, 1) check (difficulty between 0 and 22);
update public.routes set difficulty = array_position(
  array['3','4','5','5+','6A','6A+','6B','6B+','6C','6C+','7A','7A+','7B','7B+','7C','7C+','8A','8A+','8B','8B+','8C','8C+','9A'],
  upper(trim(grade))) - 1;
alter table public.routes drop column grade;

-- One ascent per climber per route; climbers are (anonymous) Supabase users.
create table public.ascents (
  id bigint generated always as identity primary key,
  route_id bigint not null references public.routes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  difficulty numeric(3, 1) check (difficulty between 0 and 22),
  rating smallint check (rating between 1 and 3),
  created_at timestamptz not null default now(),
  unique (route_id, user_id)
);
create index on public.ascents (user_id);

alter table public.ascents enable row level security;
create policy "anyone can read ascents" on public.ascents for select using (true);
create policy "log own ascents" on public.ascents for insert to authenticated
  with check (user_id = auth.uid());
create policy "edit own ascents" on public.ascents for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "remove own ascents" on public.ascents for delete to authenticated
  using (user_id = auth.uid());

-- Route list with stats. Consensus = median of the setter's grade + every grade vote.
create view public.routes_with_stats with (security_invoker = true) as
select r.*, s.sends, s.rating, v.votes, v.consensus
from public.routes r
left join lateral (
  select count(*) as sends, round(avg(a.rating), 1) as rating
  from public.ascents a where a.route_id = r.id
) s on true
left join lateral (
  select count(d) as votes, percentile_cont(0.5) within group (order by d) as consensus
  from (select r.difficulty as d union all
        select a.difficulty from public.ascents a where a.route_id = r.id) x
  where d is not null
) v on true;

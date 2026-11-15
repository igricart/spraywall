-- 0003: sends and votes need a real (Google) login; anonymous accounts can no longer log them.
-- Browsing and creating routes stay open (see 0001). Paste into Supabase SQL Editor -> Run.
drop policy "log own ascents" on public.ascents;
drop policy "edit own ascents" on public.ascents;
create policy "log own ascents" on public.ascents for insert to authenticated
  with check (user_id = auth.uid() and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false));
create policy "edit own ascents" on public.ascents for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false));

-- leftover anonymous accounts from testing (their sends go with them)
delete from auth.users where is_anonymous;

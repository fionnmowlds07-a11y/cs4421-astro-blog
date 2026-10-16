-- Row Level Security for the rowing log: anyone may read, only an admin may write.
-- Admins are listed in public.admins, so even someone who managed to create an account
-- couldn't change anything. Public sign-ups will also be switched off (admin login issue).

-- ---------------------------------------------------------------------------
-- Admins: the logins allowed to write. RLS is on with no policies, so the table
-- is invisible through the API; it's managed with SQL (or the dashboard) only.
-- ---------------------------------------------------------------------------
create table public.admins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- ---------------------------------------------------------------------------
-- is_admin() lives in a schema the API doesn't expose, so it can't be called
-- from outside. security definer lets it read admins despite that table's RLS.
-- ---------------------------------------------------------------------------
create schema private;
grant usage on schema private to anon, authenticated;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

revoke execute on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policies: the same rules for both tables.
-- (select ...) around function calls lets Postgres work them out once per query, not per row.
-- ---------------------------------------------------------------------------
create policy "anyone can read erg sessions" on public.erg_sessions
  for select to anon, authenticated using (true);
create policy "admins can add erg sessions" on public.erg_sessions
  for insert to authenticated with check ((select private.is_admin()));
create policy "admins can edit erg sessions" on public.erg_sessions
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins can delete erg sessions" on public.erg_sessions
  for delete to authenticated using ((select private.is_admin()));

create policy "anyone can read outings" on public.on_water_outings
  for select to anon, authenticated using (true);
create policy "admins can add outings" on public.on_water_outings
  for insert to authenticated with check ((select private.is_admin()));
create policy "admins can edit outings" on public.on_water_outings
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins can delete outings" on public.on_water_outings
  for delete to authenticated using ((select private.is_admin()));

-- Belt and braces: logged-out visitors can't write at all, even if a policy were later added by mistake.
revoke insert, update, delete, truncate on public.erg_sessions, public.on_water_outings from anon;
revoke all on public.admins from anon, authenticated;

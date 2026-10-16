-- Lets the website ask "is the person logged in an admin?" so /rowing/admin can turn other accounts away.
-- private.is_admin() and the admins table stay hidden; this only ever answers about the caller,
-- so it can't be used to look anyone else up. Logged-out visitors can't call it at all.

create function public.current_user_is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_admin();
$$;

revoke execute on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_is_admin() to authenticated;

-- Row Level Security: anyone can read, only admins can write, and the admins list stays private.
begin;
create extension if not exists pgtap with schema extensions;
-- Start from empty tables so the sample data from seed.sql can't affect the results (undone by the rollback).
truncate public.erg_sessions, public.on_water_outings;
select plan(17);

-- Two test logins (rolled back at the end): one admin, one stranger.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'stranger@example.test');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.erg_sessions (distance_m, duration_ds, notes) values (2000, 4000, 'original');
insert into public.on_water_outings (boat, distance_m) values ('1x', 10000);

-- Logged out -----------------------------------------------------------------
set local role anon;
select is((select count(*) from public.erg_sessions), 1::bigint, 'logged-out visitors can read erg sessions');
select is((select count(*) from public.on_water_outings), 1::bigint, 'logged-out visitors can read outings');
select throws_ok(
  $$ insert into public.erg_sessions (distance_m, duration_ds) values (2000, 4000) $$,
  '42501', null,
  'logged-out visitors cannot add sessions'
);
select throws_ok($$ select * from public.admins $$, '42501', null, 'logged-out visitors cannot see the admins list');
select is(private.is_admin(), false, 'a logged-out visitor is not an admin');
select throws_ok(
  $$ select public.current_user_is_admin() $$,
  '42501', null,
  'logged-out visitors cannot ask whether they are an admin'
);

-- A stranger with an account --------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select is((select count(*) from public.erg_sessions), 1::bigint, 'a stranger can read sessions');
select throws_ok(
  $$ insert into public.erg_sessions (distance_m, duration_ds) values (2000, 4000) $$,
  '42501', null,
  'a stranger cannot add sessions'
);
with changed as (update public.erg_sessions set notes = 'hacked' returning 1)
select is((select count(*) from changed), 0::bigint, 'a stranger cannot edit sessions');
with removed as (delete from public.on_water_outings returning 1)
select is((select count(*) from removed), 0::bigint, 'a stranger cannot delete outings');
select is(private.is_admin(), false, 'a stranger is not an admin');
select is(public.current_user_is_admin(), false, 'the website is told a stranger is not an admin');

-- The admin -----------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select is(private.is_admin(), true, 'the admin is recognised');
select is(public.current_user_is_admin(), true, 'the website is told the admin is an admin');
select lives_ok(
  $$ insert into public.erg_sessions (distance_m, duration_ds) values (5000, 10500) $$,
  'the admin can add sessions'
);
with changed as (update public.erg_sessions set notes = 'felt strong' where notes = 'original' returning 1)
select is((select count(*) from changed), 1::bigint, 'the admin can edit sessions');
with removed as (delete from public.on_water_outings returning 1)
select is((select count(*) from removed), 1::bigint, 'the admin can delete outings');

select * from finish();
rollback;

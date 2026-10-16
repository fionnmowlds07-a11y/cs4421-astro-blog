-- Erg sessions and outings: generated splits, sanity checks and timestamps.
begin;
create extension if not exists pgtap with schema extensions;
-- Start from empty tables so the sample data from seed.sql can't affect the results (undone by the rollback).
truncate public.erg_sessions, public.on_water_outings;
select plan(11);

insert into public.erg_sessions (distance_m, duration_ds) values (2000, 4000);
select is(
  (select avg_split_ds from public.erg_sessions where distance_m = 2000),
  1000,
  'a 2k in 6:40.0 has a 1:40.0 split'
);

insert into public.erg_sessions (session_type, description, distance_m, duration_ds) values ('intervals', '4x2k', 8000, 16924);
select is(
  (select avg_split_ds from public.erg_sessions where distance_m = 8000),
  1058,
  'splits are rounded to the nearest tenth (4x2k in 28:12.4 -> 1:45.8)'
);

insert into public.on_water_outings (boat, distance_m) values ('1x', 12000);
select is(
  (select avg_split_ds from public.on_water_outings where distance_m = 12000),
  null,
  'an outing without a time has no split'
);

select throws_ok(
  $$ insert into public.erg_sessions (distance_m, duration_ds, avg_split_ds) values (2000, 4000, 900) $$,
  '428C9', null,
  'the split cannot be typed in by hand'
);
select throws_ok(
  $$ insert into public.erg_sessions (distance_m, duration_ds) values (2000, 2000) $$,
  '23514', null,
  'a split faster than 1:00/500m is rejected'
);
select throws_ok(
  $$ insert into public.erg_sessions (distance_m, duration_ds) values (2000, 40000) $$,
  '23514', null,
  'a split slower than 10:00/500m is rejected'
);
select throws_ok(
  $$ insert into public.erg_sessions (distance_m, duration_ds, avg_rate) values (2000, 4000, 70) $$,
  '23514', null,
  'a stroke rate over 60 is rejected'
);
select throws_ok(
  $$ insert into public.erg_sessions (distance_m, duration_ds) values (-2000, 4000) $$,
  '23514', null,
  'a negative distance is rejected'
);
select throws_ok(
  $$ insert into public.on_water_outings (boat, distance_m) values ('9x', 1000) $$,
  '22P02', null,
  'an unknown boat class is rejected'
);
select throws_ok(
  $$ insert into public.erg_sessions (distance_m, duration_ds, notes) values (2000, 4000, repeat('a', 1001)) $$,
  '23514', null,
  'notes over 1000 characters are rejected'
);

-- now() is fixed for a whole transaction, so backdate the row to see the trigger move updated_at.
update public.erg_sessions set updated_at = now() - interval '1 day' where distance_m = 2000;
update public.erg_sessions set notes = 'felt good' where distance_m = 2000;
select is(
  (select updated_at from public.erg_sessions where distance_m = 2000),
  now(),
  'editing a session updates updated_at'
);

select * from finish();
rollback;

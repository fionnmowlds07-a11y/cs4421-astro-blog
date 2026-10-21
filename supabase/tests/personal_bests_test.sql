-- personal_bests: fastest single test per standard distance and machine.
begin;
create extension if not exists pgtap with schema extensions;
-- Start from empty tables so the sample data from seed.sql can't affect the results (undone by the rollback).
truncate public.erg_intervals, public.erg_sessions, public.on_water_outings;
select plan(4);

insert into public.erg_sessions (session_date, session_type, distance_m, duration_ds, machine, is_test, notes) values
  ('2026-09-01', 'single',    2000, 4100,  'concept2', true,  'slower 2k test'),
  ('2026-10-01', 'single',    2000, 4020,  'concept2', true,  'c2 2k pb'),
  ('2026-10-05', 'single',    2000, 3900,  'concept2', false, 'faster, but training'),
  ('2026-10-06', 'intervals', 2000, 3500,  'concept2', true,  '4x500m'),
  ('2026-10-07', 'single',    3000, 6300,  'concept2', true,  '3k'),
  ('2026-10-08', 'single',    2000, 4300,  'rp3',      true,  'rp3 2k pb'),
  ('2026-09-10', 'single',    6000, 13200, 'concept2', true,  'first 6k'),
  ('2026-10-10', 'single',    6000, 13200, 'concept2', true,  'equal 6k, later');

select results_eq(
  $$ select pb.machine::text, pb.label, s.notes
     from public.personal_bests pb join public.erg_sessions s on s.id = pb.session_id
     order by pb.machine, pb.distance_m $$,
  $$ values ('concept2', '2k', 'c2 2k pb'), ('concept2', '6k', 'first 6k'), ('rp3', '2k', 'rp3 2k pb') $$,
  'PBs are the fastest single tests, per machine, at standard distances only (ties go to the earlier one)'
);
select is(
  (select avg_split_ds from public.personal_bests where machine = 'concept2' and label = '2k'),
  1005,
  'a PB carries its split'
);

-- The view follows the table's read rules, so logged-out visitors see the PBs too.
set local role anon;
select is((select count(*) from public.personal_bests), 3::bigint, 'logged-out visitors can read PBs');
select throws_ok(
  $$ insert into public.personal_bests (distance_m) values (2000) $$,
  null, null,
  'nobody can write to the PB view'
);

select * from finish();
rollback;

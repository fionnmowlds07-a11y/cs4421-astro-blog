-- Interval pieces: saving a session with its pieces in one go, totals worked out from the pieces,
-- the sanity checks, and the same read/write rules as the sessions.
begin;
create extension if not exists pgtap with schema extensions;
-- Start from empty tables so the sample data from seed.sql can't affect the results (undone by the rollback).
truncate public.erg_intervals, public.erg_sessions, public.on_water_outings;
select plan(22);

-- Two test logins (rolled back at the end): one admin, one stranger.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'pgtap-admin@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'pgtap-stranger@example.test');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-00000000000a');

-- A 5x1k: 3:10.0, 3:08.5, 3:09.0, 3:07.5, 3:05.0, rates 30 to 32.
create temporary table five_by_1k as select '[
  {"distance_m": 1000, "duration_ds": 1900, "avg_rate": 30},
  {"distance_m": 1000, "duration_ds": 1885, "avg_rate": 30},
  {"distance_m": 1000, "duration_ds": 1890, "avg_rate": 31},
  {"distance_m": 1000, "duration_ds": 1875, "avg_rate": 31},
  {"distance_m": 1000, "duration_ds": 1850, "avg_rate": 32}
]'::jsonb as pieces;
grant select on five_by_1k to authenticated;
create temporary table saved (id uuid);
grant select, insert, delete on saved to authenticated;

-- The admin -----------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

insert into saved
select public.save_erg_session(
  null,
  '{"session_date": "2026-10-20", "session_type": "intervals", "description": "5x1k r3''", "machine": "concept2"}',
  (select pieces from five_by_1k)
);

select is((select count(*) from public.erg_intervals), 5::bigint, 'the admin saves all five pieces');
select is(
  (select array_agg(duration_ds order by piece_no) from public.erg_intervals),
  array[1900, 1885, 1890, 1875, 1850],
  'the pieces keep the order they were typed in'
);
select is(
  (select avg_split_ds from public.erg_intervals where piece_no = 5),
  925,
  'each piece gets its own split (1k in 3:05.0 -> 1:32.5)'
);
select is(
  (select distance_m from public.erg_sessions where id = (select id from saved)),
  5000,
  'the session distance is the total of the pieces'
);
select is(
  (select duration_ds from public.erg_sessions where id = (select id from saved)),
  9400,
  'the session time is the total of the pieces (15:40.0)'
);
select is(
  (select avg_rate from public.erg_sessions where id = (select id from saved)),
  31,
  'with no rate given, the session rate is the average of the pieces'
);

select public.save_erg_session(
  (select id from saved),
  '{"session_date": "2026-10-20", "session_type": "intervals", "description": "3x2k", "avg_rate": 28}',
  '[{"distance_m": 2000, "duration_ds": 3900}, {"distance_m": 2000, "duration_ds": 3850}, {"distance_m": 2000, "duration_ds": 3800}]'
);
select is((select count(*) from public.erg_intervals), 3::bigint, 'editing replaces the pieces');
select is(
  (select row(distance_m, duration_ds, avg_rate, description)::text from public.erg_sessions where id = (select id from saved)),
  row(6000, 11550, 28, '3x2k')::text,
  'editing updates the totals, and a rate typed in for the session wins'
);

select public.save_erg_session(
  (select id from saved),
  '{"session_date": "2026-10-20", "session_type": "single", "distance_m": 2000, "duration_ds": 3720}'
);
select is((select count(*) from public.erg_intervals), 0::bigint, 'changing it to a single piece removes the pieces');
select is(
  (select duration_ds from public.erg_sessions where id = (select id from saved)),
  3720,
  'a single piece keeps the time it was given'
);

select throws_ok(
  $$ select public.save_erg_session(null, '{"session_type": "single", "distance_m": 2000, "duration_ds": 3720}', '[{"distance_m": 1000, "duration_ds": 1900}, {"distance_m": 1000, "duration_ds": 1900}]') $$,
  '22023', null,
  'a single piece cannot have pieces'
);
select throws_ok(
  $$ select public.save_erg_session(null, '{"session_type": "intervals"}', '[{"distance_m": 1000, "duration_ds": 1900}]') $$,
  '22023', null,
  'an interval session needs at least two pieces'
);
select throws_ok(
  format(
    'select public.save_erg_session(null, %L, %L)',
    '{"session_type": "intervals"}',
    (select jsonb_agg(jsonb_build_object('distance_m', 500, 'duration_ds', 900)) from generate_series(1, 21))
  ),
  '22023', null,
  'an interval session has at most 20 pieces'
);
select throws_ok(
  $$ select public.save_erg_session(null, '{"session_type": "intervals"}', '[{"distance_m": 1000, "duration_ds": 1900}, {"distance_m": 1000, "duration_ds": 500}]') $$,
  '23514', null,
  'a piece with an impossible split is rejected'
);
select is((select count(*) from public.erg_sessions), 1::bigint, 'a rejected save leaves nothing half-saved');
select throws_ok(
  $$ select public.save_erg_session('3f2b8c4e-9a1d-4e5f-8b7a-1c2d3e4f5a6b', '{"session_type": "single", "distance_m": 2000, "duration_ds": 3720}') $$,
  'P0002', null,
  'editing a session that does not exist says so'
);

delete from saved;
insert into saved
select public.save_erg_session(null, '{"session_type": "intervals", "description": "5x1k"}', (select pieces from five_by_1k));
select throws_ok(
  format('insert into public.erg_intervals (session_id, piece_no, distance_m, duration_ds) values (%L, 1, 1000, 1900)', (select id from saved)),
  '23505', null,
  'a piece number cannot be used twice in one session'
);
delete from public.erg_sessions where id = (select id from saved);
select is((select count(*) from public.erg_intervals), 0::bigint, 'deleting a session deletes its pieces');

-- Logged out -----------------------------------------------------------------
reset role;
-- Saved as the database owner (row level security doesn't apply), so there's something to read.
select public.save_erg_session(null, '{"session_type": "intervals", "description": "5x1k"}', (select pieces from five_by_1k));
set local role anon;
select is((select count(*) from public.erg_intervals), 5::bigint, 'logged-out visitors can read the pieces');
select throws_ok(
  $$ select public.save_erg_session(null, '{"session_type": "single", "distance_m": 2000, "duration_ds": 3720}') $$,
  '42501', null,
  'logged-out visitors cannot save sessions'
);

-- A stranger with an account --------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select throws_ok(
  $$ select public.save_erg_session(null, '{"session_type": "intervals"}', '[{"distance_m": 1000, "duration_ds": 1900}, {"distance_m": 1000, "duration_ds": 1900}]') $$,
  '42501', null,
  'a stranger cannot add sessions with pieces'
);
select throws_ok(
  format(
    'select public.save_erg_session(%L, %L)',
    (select id from public.erg_sessions limit 1),
    '{"session_type": "single", "distance_m": 2000, "duration_ds": 3720}'
  ),
  'P0002', null,
  'a stranger cannot change my sessions (row level security hides them from the update)'
);

select * from finish();
rollback;

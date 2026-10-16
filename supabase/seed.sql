-- Sample rowing data for LOCAL development only, loaded by `supabase db reset`.
-- It is never pushed to the real project; every row is marked "Sample" so it can't be mistaken for real results.
-- Times are tenths of a second (6:12.0 = 3720); splits are worked out by the database.

insert into public.erg_sessions
  (session_date, session_type, description, distance_m, duration_ds, avg_rate, avg_heart_rate, machine, is_test, notes)
values
  ('2026-09-07', 'single',    null,             2000,  3768,  33, 188, 'concept2', true,  'Sample: early-season 2k test'),
  ('2026-09-09', 'single',    '60 min UT2',     15420, 36000, 18, 142, 'concept2', false, 'Sample: steady state'),
  ('2026-09-12', 'intervals', '4x2k r5''',      8000,  15340, 26, 172, 'concept2', false, 'Sample: threshold work'),
  ('2026-09-16', 'single',    null,             6000,  12048, 28, 176, 'concept2', true,  'Sample: 6k test'),
  ('2026-09-19', 'intervals', '8x500m r2''',    4000,  6600,  34, 182, 'concept2', false, 'Sample: speed work'),
  ('2026-09-23', 'single',    null,             500,   832,   40, 180, 'concept2', true,  'Sample: 500m test'),
  ('2026-09-26', 'single',    '45 min UT1',     11880, 27000, 22, 158, 'rp3',      false, 'Sample: RP3 at the club'),
  ('2026-09-30', 'single',    null,             1000,  1786,  37, 186, 'concept2', true,  'Sample: 1k test'),
  ('2026-10-03', 'single',    null,             5000,  9930,  29, 178, 'concept2', true,  'Sample: 5k test'),
  ('2026-10-06', 'intervals', '3x10'' r3''',    8550,  18000, 24, 165, 'concept2', false, 'Sample: 3x10 minutes'),
  ('2026-10-10', 'single',    null,             2000,  3720,  34, 190, 'concept2', true,  'Sample: 2k test, new PB'),
  ('2026-10-12', 'single',    null,             2000,  3810,  33, 187, 'rp3',      true,  'Sample: RP3 2k');

insert into public.on_water_outings
  (outing_date, boat, crew, distance_m, duration_ds, avg_rate, conditions, notes)
values
  ('2026-09-08', '1x', null,                    14000, 36600, 20, 'flat',            'Sample: long steady paddle'),
  ('2026-09-14', '2x', 'Sample partner',        12000, 28800, 22, 'light headwind',  'Sample: technical work'),
  ('2026-09-21', '8+', 'Sample club eight',     16000, null,  24, 'choppy',          'Sample: no time recorded'),
  ('2026-10-04', '1x', null,                    2000,  4380,  32, 'tailwind',        'Sample: race-pace 2k'),
  ('2026-10-11', '4x', 'Sample quad',           10000, 22800, 26, 'flat',            'Sample: pieces at 26');

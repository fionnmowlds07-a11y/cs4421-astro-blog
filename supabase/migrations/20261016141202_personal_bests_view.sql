-- Personal bests at the standard erg distances, worked out from erg_sessions so they update by themselves.
-- Only single continuous pieces marked as tests count (4x500m adds up to 2000 m, but isn't a 2k).
-- PBs are kept per machine, since a Concept2 and an RP3 don't feel or score the same.
-- security_invoker makes the view follow erg_sessions' read rules instead of bypassing them.

create view public.personal_bests
with (security_invoker = true)
as
with standard_distances (distance_m, label) as (
  values (500, '500m'), (1000, '1k'), (2000, '2k'), (5000, '5k'), (6000, '6k'), (10000, '10k')
),
ranked as (
  select
    s.*,
    d.label,
    -- Fastest first; a tie goes to whoever set it first.
    row_number() over (partition by s.machine, s.distance_m order by s.duration_ds, s.session_date, s.created_at) as place
  from public.erg_sessions s
  join standard_distances d on d.distance_m = s.distance_m
  where s.is_test and s.session_type = 'single'
)
select
  id as session_id,
  machine,
  distance_m,
  label,
  duration_ds,
  avg_split_ds,
  avg_rate,
  session_date
from ranked
where place = 1;

-- Read-only for everyone.
revoke all on public.personal_bests from anon, authenticated;
grant select on public.personal_bests to anon, authenticated;

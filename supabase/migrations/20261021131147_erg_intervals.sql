-- Each piece of an interval session (e.g. all five 1k pieces of a 5x1k), so I can see how the pieces went
-- and not just the total. The session row keeps the totals, which save_erg_session() works out from the
-- pieces, so the admin list and the personal_bests view carry on working unchanged.

-- ---------------------------------------------------------------------------
-- Pieces
-- ---------------------------------------------------------------------------
create table public.erg_intervals (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.erg_sessions (id) on delete cascade,
  piece_no     int not null check (piece_no between 1 and 20),
  distance_m   int not null check (distance_m between 100 and 100000),
  duration_ds  int not null check (duration_ds between 100 and 360000),
  avg_split_ds int generated always as (round(duration_ds * 500.0 / distance_m)::int) stored,
  avg_rate     int check (avg_rate between 10 and 60),
  -- Same typing-mistake guard as erg_sessions: 1:00.0 to 10:00.0 per 500 m.
  constraint erg_intervals_split_plausible check (duration_ds * 500.0 / distance_m between 600 and 6000),
  -- One row per piece number; the unique index also makes "all pieces of a session" quick to find.
  constraint erg_intervals_piece_unique unique (session_id, piece_no)
);

-- Same rules as the sessions: anyone may read, only an admin may write, logged-out visitors never.
alter table public.erg_intervals enable row level security;

create policy "anyone can read erg intervals" on public.erg_intervals
  for select to anon, authenticated using (true);
create policy "admins can add erg intervals" on public.erg_intervals
  for insert to authenticated with check ((select private.is_admin()));
create policy "admins can edit erg intervals" on public.erg_intervals
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins can delete erg intervals" on public.erg_intervals
  for delete to authenticated using ((select private.is_admin()));

revoke insert, update, delete, truncate on public.erg_intervals from anon;

-- ---------------------------------------------------------------------------
-- save_erg_session(): saves a session and its pieces together, in one transaction.
-- p_id null adds a new session; otherwise that session is updated and its pieces replaced.
-- With pieces, the session's distance and time are their totals (and its rate their average,
-- if none was given), so the two can never disagree. With no pieces, any old ones are removed.
-- security invoker: it runs as the caller, so the row level security above still decides.
-- ---------------------------------------------------------------------------
create function public.save_erg_session(p_id uuid, p_session jsonb, p_pieces jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id       uuid;
  v_pieces   int := jsonb_array_length(p_pieces);
  v_distance int := (p_session ->> 'distance_m')::int;
  v_duration int := (p_session ->> 'duration_ds')::int;
  v_rate     int := (p_session ->> 'avg_rate')::int;
begin
  if v_pieces > 0 then
    if p_session ->> 'session_type' is distinct from 'intervals' then
      raise exception 'only interval sessions have pieces' using errcode = '22023';
    end if;
    if v_pieces not between 2 and 20 then
      raise exception 'an interval session has 2 to 20 pieces' using errcode = '22023';
    end if;
    select sum((p ->> 'distance_m')::int), sum((p ->> 'duration_ds')::int),
           coalesce(v_rate, round(avg((p ->> 'avg_rate')::int))::int)
      into v_distance, v_duration, v_rate
      from jsonb_array_elements(p_pieces) as p;
  end if;

  if p_id is null then
    insert into public.erg_sessions
      (session_date, session_type, description, distance_m, duration_ds,
       avg_rate, avg_heart_rate, machine, is_test, notes)
    values (
      coalesce((p_session ->> 'session_date')::date, current_date),
      coalesce((p_session ->> 'session_type')::public.erg_session_type, 'single'),
      p_session ->> 'description',
      v_distance,
      v_duration,
      v_rate,
      (p_session ->> 'avg_heart_rate')::int,
      coalesce((p_session ->> 'machine')::public.erg_machine, 'concept2'),
      coalesce((p_session ->> 'is_test')::boolean, false),
      p_session ->> 'notes'
    )
    returning id into v_id;
  else
    update public.erg_sessions set
      session_date   = coalesce((p_session ->> 'session_date')::date, session_date),
      session_type   = coalesce((p_session ->> 'session_type')::public.erg_session_type, session_type),
      description    = p_session ->> 'description',
      distance_m     = v_distance,
      duration_ds    = v_duration,
      avg_rate       = v_rate,
      avg_heart_rate = (p_session ->> 'avg_heart_rate')::int,
      machine        = coalesce((p_session ->> 'machine')::public.erg_machine, machine),
      is_test        = coalesce((p_session ->> 'is_test')::boolean, is_test),
      notes          = p_session ->> 'notes'
    where id = p_id
    returning id into v_id;

    -- Missing, or hidden from this caller by row level security.
    if v_id is null then
      raise exception 'erg session not found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.erg_intervals where session_id = v_id;
  insert into public.erg_intervals (session_id, piece_no, distance_m, duration_ds, avg_rate)
  select v_id, t.ord::int, (t.p ->> 'distance_m')::int, (t.p ->> 'duration_ds')::int, (t.p ->> 'avg_rate')::int
    from jsonb_array_elements(p_pieces) with ordinality as t (p, ord);

  return v_id;
end;
$$;

-- Logged-out visitors can't write anyway; this stops them calling it at all.
revoke execute on function public.save_erg_session(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_erg_session(uuid, jsonb, jsonb) to authenticated;

-- Rowing training log tables (ADR-002): erg sessions and on-water outings for one rower.
-- Ideas adapted from UL Erg: times and splits are whole tenths of a second (1:47.7 = 1077),
-- with sanity limits on splits and rates. Row Level Security is switched on here with no
-- policies, which blocks all API access until the next migration adds the read/write rules.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.erg_machine as enum ('concept2', 'rp3');

-- A single continuous piece, or intervals stored as one row with their totals (e.g. "4x2k r5'").
create type public.erg_session_type as enum ('single', 'intervals');

create type public.boat_class as enum ('1x', '2x', '2-', '4x', '4-', '4+', '8+');

-- Keeps updated_at current on every edit.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Erg sessions
-- ---------------------------------------------------------------------------
create table public.erg_sessions (
  id             uuid primary key default gen_random_uuid(),
  session_date   date not null default current_date,
  session_type   public.erg_session_type not null default 'single',
  description    text check (description is null or length(trim(description)) between 1 and 80),
  distance_m     int not null check (distance_m between 100 and 100000),
  duration_ds    int not null check (duration_ds between 100 and 360000),         -- 10 s to 10 h
  -- Average split per 500 m, worked out by the database so it always matches distance and time.
  avg_split_ds   int generated always as (round(duration_ds * 500.0 / distance_m)::int) stored,
  avg_rate       int check (avg_rate between 10 and 60),
  avg_heart_rate int check (avg_heart_rate between 40 and 230),
  machine        public.erg_machine not null default 'concept2',
  is_test        boolean not null default false,                                 -- only tests count as PBs
  notes          text check (notes is null or length(notes) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Splits outside 1:00.0 to 10:00.0 per 500 m are almost certainly typing mistakes.
  constraint erg_sessions_split_plausible check (duration_ds * 500.0 / distance_m between 600 and 6000)
);

create index erg_sessions_date_idx on public.erg_sessions (session_date desc, created_at desc);

create trigger erg_sessions_updated_at
  before update on public.erg_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- On-water outings
-- ---------------------------------------------------------------------------
create table public.on_water_outings (
  id           uuid primary key default gen_random_uuid(),
  outing_date  date not null default current_date,
  boat         public.boat_class not null,
  crew         text check (crew is null or length(trim(crew)) between 1 and 200),
  distance_m   int not null check (distance_m between 100 and 100000),
  duration_ds  int check (duration_ds between 100 and 360000),                   -- optional on the water
  avg_split_ds int generated always as (
    case when duration_ds is null then null else round(duration_ds * 500.0 / distance_m)::int end
  ) stored,
  avg_rate     int check (avg_rate between 10 and 60),
  conditions   text check (conditions is null or length(trim(conditions)) between 1 and 80),
  notes        text check (notes is null or length(notes) <= 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on_water_outings_date_idx on public.on_water_outings (outing_date desc, created_at desc);

create trigger on_water_outings_updated_at
  before update on public.on_water_outings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Locked by default: no API access until policies are added.
-- ---------------------------------------------------------------------------
alter table public.erg_sessions enable row level security;
alter table public.on_water_outings enable row level security;

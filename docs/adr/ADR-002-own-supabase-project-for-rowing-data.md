# ADR-002: Use a Dedicated Supabase Project for Rowing Data

## Status: Accepted (Date: 2026-10-16)

## Context

The Rowing tab will become a training log: erg sessions and on-water outings, personal
bests and a progress chart. That needs a database that survives redeploys, plus a way
for only the site owner to add and edit sessions while everyone else can read.

I already maintain UL Erg, a separate app for my rowing club that uses its own
Supabase project. That database holds teammates' results and lets anyone with the
public key write to it. Its ideas (splits stored in tenths of a second, split entry
like `1477` meaning `1:47.7`, PB logic) are worth reusing here.

The blog runs as a stateless container (ADR-001), so anything stored inside the
container is lost when it is replaced.

## Decision

The blog gets its own Supabase project (free tier), separate from UL Erg. Only the
schema ideas and split logic are copied from UL Erg and adapted in this repository.

- **Schema as code:** tables and security rules are written as Supabase CLI migrations
  in `supabase/migrations/`, committed to git and reviewed like any other change,
  never edited by hand in the dashboard.
- **Local development:** `supabase start` runs the full stack (Postgres, Auth, API) in
  Docker, so development and tests never touch the live project.
- **Access control in the database:** Row Level Security makes everything publicly
  readable but writable only by my own account. Supabase Auth handles the login, with
  public sign-ups disabled.
- **Secrets:** the project URL and keys are server-only `astro:env` variables read
  from `.env` at runtime, like the football-data.org key. They are never sent to the
  browser or built into the Docker image. The admin `service_role` key is not used by
  the website at all.
- **Health:** `/api/health` stays database-free so the container healthcheck and CI do
  not depend on Supabase; `/api/health?deep=1` additionally checks the database.

## Consequences

- Positive: Team data stays private and unaffected; the blog can be developed, tested
  and broken without risk to the club's app.
- Positive: The whole database lives in git as migrations, so it can be recreated from
  scratch locally or in a new project.
- Positive: Login, access control and a REST API come built in, with no extra servers
  to run, and it costs nothing at this scale.
- Negative: A second external service the site depends on. Pages that need it must
  handle it being unavailable, as the football pages already do.
- Negative: Free-tier projects are paused after a week without activity. A scheduled
  keep-alive request (a later issue) is needed so the live site keeps working.
- Negative: Past results are not shared automatically with UL Erg; my own results will
  be imported once from a CSV export (a later issue).

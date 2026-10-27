# Reliability: SLIs, SLOs and the Error Budget

How reliable the SSR site should be, how I measure it, and what I do when it isn't. The
site and how to run it are in ADR-003 and the [runbook](runbook.md).

## What I measure (SLIs)

Both come from the JSON line every request writes to CloudWatch (`statusCode`,
`latencyMs`). Requests to `/api/health` are left out, as they come from the load balancer
every 15 seconds, not from visitors.

| SLI          | Good request                                       | Formula                      |
| ------------ | -------------------------------------------------- | ---------------------------- |
| Availability | Didn't return a 5xx (a 4xx is the visitor's fault) | good requests / all requests |
| Latency      | Answered in 500 ms or less                         | fast requests / all requests |

`latencyMs` is measured inside the app, so it doesn't include CloudFront or the visitor's
network. Pages CloudFront answers from its cache never reach the app and aren't counted.

## Objectives (SLOs)

Over a rolling 7 days:

- **Availability: 99.5%** of requests don't return a 5xx.
- **Latency: 95%** of requests are answered in 500 ms or less (p95 ≤ 500 ms).

Why these numbers:

- **Not 100%:** nothing is. The site depends on a free Supabase project that can pause and
  on the football API, which limits and sometimes fails. 99.5% still means only 1 request in
  200 can fail.
- **Not 99.9%:** two small copies and free-tier dependencies can't promise that, and it
  would leave about 10 minutes a week for every problem.
- **500 ms:** prerendered and cached pages take a few ms, so they're far below it. It leaves
  room for an occasional football page with an empty cache, which waits for the external
  API (about 1 second). A lower limit would measure the football API more than my site.
- **7 days:** the logs are kept for a week. The SLO counts requests, not minutes, so the
  hours the site is switched off between sessions don't count against it.

## Error budget

The budget is what the SLO allows to go wrong: **0.5% of requests** (1 in 200) may fail,
and 5% may be slower than 500 ms. If the site ran all week, 0.5% would be about **50
minutes** of full outage.

| Budget left    | What I do                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| More than half | Normal work: features from the top of Ready                                                                     |
| Less than half | Check what used it; anything risky waits                                                                        |
| Used up        | **Feature freeze.** Only reliability fixes, rollbacks and tests until the SLI is back above the SLO over 7 days |

## How to check it

CloudWatch → Logs → **Logs Insights**, pick the log group, time range 1 week:

```
filter ispresent(statusCode) and route != "/api/health"
| stats count(*) as requests,
        100 * sum(statusCode < 500) / count(*) as availability,
        100 * sum(latencyMs <= 500) / count(*) as fast,
        pct(latencyMs, 95) as p95,
        pct(latencyMs, 99) as p99
```

Budget used = (100 − availability) / 0.5 × 100%. For example, availability 99.8% has
used 40% of the budget.

## Known limits

- A route that throws an error returns 500 but writes no JSON line (see the runbook), so
  those failures aren't counted and availability can look better than it is.
- The log group is deleted with the stack by Infra Down, so in practice the SLIs can only
  be worked out for the session that's running, not across sessions. Keeping the
  environment running (ADR-003) would fix this.
- Nothing is measured from outside AWS. If CloudFront or DNS fails, the app never sees the
  requests. A synthetic check (e.g. CloudWatch Synthetics) would catch that.

## When something breaks

1. **Detect:** an alarm goes red in CloudWatch → Alarms (`astro-blog-server-errors` or
   `astro-blog-unhealthy-copies`), or a check like `/api/health` fails.
2. **Triage:** follow the runbook. Which alarm? Which route? Live Tail and Logs Insights
   for the failing line, ECS service events for failed health checks.
3. **Mitigate first:** roll back to the previous version (runbook, under 90 seconds), then
   check `/api/health` is 200 again. Fixing the cause comes after the site works.
4. **Fix:** an issue and a branch as usual, a test that reproduces the bug, then a normal
   deploy.
5. **Post-mortem:** for anything that used a big part of the budget or needed a rollback,
   written within 2 days, using the template below. It's blameless: it asks what let it
   happen, not who did it.

## Post-mortem template

Copy this into a new issue titled `Post-mortem: <what happened>`.

```markdown
## Summary

One or two sentences: what broke, for how long, who noticed.

## Impact

- Start and end time (UTC):
- What visitors saw (errors, slow pages, which routes):
- Error budget used:

## Timeline

- HH:MM: what happened / what I did

## Root cause

What actually caused it, and why it got past the tests.

## What went well

## What went badly

## Actions

- The fix (with its issue)
- What stops it happening again (a test, an alarm, a check)
```

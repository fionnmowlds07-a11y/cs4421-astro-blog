# ADR-001: Transition from Static Site to Containerized SSR Runtime

## Status: Accepted (Date: 2026-10-05)

## Context

The blog is currently built with Astro `output: 'static'` and deployed to an S3 bucket
behind CloudFront via AWS CDK. We now need dynamic API endpoints (`/api/health`,
`/api/feedback`) and per-request structured logging. S3 static hosting can only serve
files; it cannot execute server-side Node.js code.

## Decision

We will configure Astro with `output: 'server'` and the `@astrojs/node` adapter in
standalone mode, and package the application as a Docker container.

Content pages (home, about, blog index, blog posts, RSS) remain prerendered with
`export const prerender = true`, so they keep the performance of static HTML. Only
API routes render on demand.

## Consequences

- Positive: Enables live API routes, health probes for the container platform, and
  structured JSON logs that can be queried and alarmed on in CloudWatch.
- Negative: Requires running container compute instead of only S3, which adds
  operational complexity (process health, scaling, patching) and cost.
- Negative: The existing `deploy-static.yml` S3 deployment is incompatible with the
  new `dist/client` + `dist/server` build output and must be replaced before this
  change is merged to `main`.

## Comparison with the static version (added 2026-10-22)

To compare the two side by side, I put the last static version of the site (tag `v1.0.0`,
commit `1a0590d`) back online on S3 + CloudFront: https://d1z4vq94w0hd5.cloudfront.net

| | Static (`v1.0.0`) | Containers / SSR (`main`) |
|---|---|---|
| How pages are made | Every page is turned into an HTML file once, when the site is built | Normal pages are still built in advance; the APIs, Man United and rowing pages are made fresh on every visit |
| Where it runs | Files in a private S3 bucket, served by CloudFront | A Docker container on AWS ECS (2 copies) behind a load balancer, with CloudFront in front for HTTPS |
| How a new version goes live | Build, upload the files, clear the CloudFront cache | Build the image, push it to ECR, swap the containers one at a time once `/api/health` says OK |
| Going back to an older version | Deploy the previous tag again | Point ECS at the previous image in ECR (no rebuild, under 90 seconds) |
| Cost | About €0, because nothing runs when nobody visits | About $1.15 a day while it runs, so I only switch it on when I need it |
| What it can do | Show pages very fast from the CDN | APIs, health checks, live football data, logging in, the rowing database, logs |
| What it can't do | Run any code when someone visits: no APIs, no login, no live data | Nothing missing, but there are more parts to run, update and watch |
| Watching it | Only CloudFront's own numbers | CloudWatch logs, alarms and p95/p99 response times |
| Known weak spots | A missing page shows 403 instead of 404, and `http://` isn't sent to `https://` | A container can crash, which is why there are 2 copies and health checks |

**Why it was worth it:** My site needs to run code when someone visits: the API endpoints and
health check, the live Man United stats, and the rowing log with a login and a database. A
static site can only hand out files, so it can't do any of that. Containers cost more and have
more parts to look after, but I keep the cost low by only switching the AWS environment on when
I need it, and the health checks, two copies and quick rollback keep it reliable. For a site
with no dynamic features I would still pick static, because it's simpler, safer and almost free.

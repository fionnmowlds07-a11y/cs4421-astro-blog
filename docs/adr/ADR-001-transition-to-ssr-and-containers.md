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

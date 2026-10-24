# ADR-003: Run the Site on ECS Fargate, Created and Deleted per Session

## Status: Accepted (Date: 2026-10-24)

## Context

ADR-001 moved the site from static files to a server-rendered Docker container, so it
now needs somewhere on AWS that runs containers. The site should keep working if a copy
of it crashes, and a broken new version should never take it down.

I moved to a new, paid AWS account because I couldn't get back into my old one. It has
no free credits, so everything that runs costs money by the hour. GitHub logs in to it
with OIDC (temporary credentials), so no AWS keys are stored in the repo or in GitHub.

## Options considered

1. **One EC2 server running Docker.** Cheapest per hour and easy to picture. Rejected:
   I would have to patch it, restart the app when it crashes and roll back by hand, and
   if the one server dies the site is down.
2. **Lambda.** Almost free with little traffic. Rejected: Astro runs as a long-lived
   Node server, so it would need a different adapter and app changes, and it wouldn't
   use the Docker image at all.
3. **EKS (Kubernetes).** Very powerful. Rejected: about $0.10 an hour before running
   anything, and far too complicated for one site.
4. **ECS Fargate.** Chosen.

## Decision

The site runs on ECS Fargate: AWS runs the containers from my image and I never manage
a server. The main reasons are that **ECS restarts crashed copies by itself** and **rolls
back a broken version automatically** (the deployment circuit breaker).

- **2 copies behind a load balancer:** if one copy fails, the other keeps serving
  (redundancy). The load balancer checks `/api/health` on each copy every 15 seconds and
  stops sending visitors to a copy that fails twice in a row; ECS then replaces it.
- **Zero-downtime updates:** a new version starts next to the old one (up to 200%) and
  must pass the health check before the old copies are stopped (never below 100%).
- **CloudFront in front** gives the site an HTTPS address.
- **Images in ECR**, labelled with the commit ID and the release version (e.g. `v2.0.0`).
  Labels can't be moved, so rolling back to a version always means exactly that image.
- **Secrets in Parameter Store** (SecureString). The containers get them when they
  start; they are never in the repo, the image or GitHub.
- **Logs in CloudWatch:** one JSON line per request, kept for a week.
- **Created and deleted per session to save money.** I don't have free credits, so the
  "Infra Up" workflow builds everything from code (CDK) when I need it, and "Infra Down"
  deletes it all again afterwards, including the images. A session of about 50 minutes
  costs roughly $0.05–0.10. The static v1.0.0 site (ADR-001) stays up, as it costs about
  nothing.
- **No NAT gateway** (about $32 a month): the containers get public IPs to reach ECR,
  Supabase and the football API, but they only accept traffic from the load balancer.

## Consequences

- Positive: The site heals itself: crashed copies are replaced and a bad release is
  rolled back without me doing anything.
- Positive: Updates don't cause downtime, and one copy failing doesn't take the site down.
- Positive: The whole environment is code, so it can be rebuilt with one button in
  about 10 minutes, and nothing costs money between sessions.
- Negative: The addresses change every session (they are printed by "Infra Up"), and
  each session starts with an empty image repository, so older versions have to be
  rebuilt before I can roll back to them.
- Negative: More expensive per hour than one EC2 server, and more parts to understand
  (cluster, task, service, load balancer).
- Negative: CloudFront talks to the load balancer over plain HTTP, so Astro's form origin
  check refuses logins on the CloudFront address. My own domain (#121) fixes this with
  HTTPS all the way through.

## What I'd do with more money or time

- Leave the environment running instead of creating and deleting it every session.
- Use my own domain (`blog.fionnmowlds.online`, #121), with HTTPS all the way to the
  containers.
- Add auto-scaling, so more copies start when traffic is high and stop when it drops.

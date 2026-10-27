# Runbook: the SSR Site on AWS

How to start, check, debug, roll back and stop the containerised site (ADR-003). The
environment only exists during a session, so its addresses and names change every time:
they are in the summary of the **Infra Up** run.

How reliable the site should be (SLOs, error budget) and the post-mortem template are in
[sre.md](sre.md).

All AWS commands below run in **CloudShell** (AWS console, top bar `>_`), signed in as
`fionn-admin` in **N. Virginia (us-east-1)**. My laptop's AWS keys belong to the old account.

## One-time setup (already done)

- Supabase project `sdeutzqfwyfataqwxvur`: migrations pushed with `supabase db push`
  (never the seed), my admin login added to `public.admins`, sign-ups off, minimum
  password length 12.
- Parameter Store (SecureString), read by the containers when they start:
  `/astro-blog/SUPABASE_URL`, `/astro-blog/SUPABASE_PUBLISHABLE_KEY`,
  `/astro-blog/FOOTBALL_DATA_API_KEY`. Check they exist (names only):
  `aws ssm describe-parameters --query "Parameters[].Name"`
- GitHub repo variables `AWS_ROLE_ARN` and `AWS_REGION`; the role only trusts runs on `main`.
- Route 53 hosted zone `fionnmowlds.website` ($0.50 a month). Never delete it: a new zone
  gets new nameservers, which would have to be set again at GoDaddy.
- Wildcard certificate `*.fionnmowlds.website` in the `AstroBlogDomain` stack (free). Created
  the first time the static or SSR stack is deployed; Infra Down never deletes it.
- Optional: so `blog.` and `lb.` work sooner after Infra Up, lower how long DNS servers
  remember a missing name. Route 53 → the zone → the **SOA** record → Edit: set the TTL to
  `60` and the last number of the value (`86400`) to `60`.

## Start a session

1. GitHub → **Actions → Infra Up → Run workflow** (branch `main`). It takes about 10–15 minutes.
2. It creates the ECR repository, builds and pushes the image (labelled with the commit ID,
   plus the release version if the commit has one), deploys the SSR stack and waits until
   `/api/health` returns 200 through CloudFront, then checks my domain's addresses too.
3. Open the run's **Summary** for this session's values:

| Output          | What it's for                                                   |
| --------------- | --------------------------------------------------------------- |
| SiteUrl         | The site on my domain: `https://blog.fionnmowlds.website`       |
| CloudFrontUrl   | The same site on its CloudFront address (changes every session) |
| LoadBalancerUrl | The load balancer directly: `https://lb.fionnmowlds.website`    |
| ClusterName     | ECS cluster, for the rollback commands                          |
| ServiceName     | ECS service, for the rollback commands                          |
| LogGroupName    | CloudWatch log group                                            |

It's HTTPS all the way: visitor → CloudFront → load balancer (as `lb.`) → containers inside
the network. Logging in to `/rowing/admin` works on all three addresses. If `blog.` doesn't
open straight after Infra Up, DNS servers still remember it as missing from when it was
down: use the CloudFront address and try again in a few minutes.

The rowing page is cached for up to 5 minutes by CloudFront (and 1 minute by the browser),
so a new session can take a few minutes to show up for visitors.

## Check it's healthy

- `<SiteUrl>/api/health` → 200 (the app is running, no database needed).
- `<SiteUrl>/api/health?deep=1` → also checks Supabase.
- EC2 → **Target groups** → the site's target group → **Targets**: both copies `healthy`.
- ECS → cluster → service → **Deployments / Events**: what ECS did and why (failed health
  checks, replaced copies, circuit breaker rollbacks).

## Read the logs

Every request writes one JSON line: `timestamp`, `level`, `route`, `method`, `statusCode`,
`latencyMs`. The load balancer calls `/api/health` every 15 seconds, so filter it out.

**Live (fault triage):** CloudWatch → Logs → **Live Tail** → pick the log group → Start.
Filter with `ERROR` to see only failures. Crashes at startup are plain text, not JSON, so
look without a filter too. Stop Live Tail afterwards.

A route that throws an error is also plain text: `[ERROR] Error: <message>` and a stack
trace, with **no** JSON line for that request (the visitor still gets a 500). The trace
points at the built file, e.g. `dist/server/chunks/feedback_xxxx.mjs:8:8`: the chunk name
says which route broke, the line number is in the bundle, so open the matching file in `src/`.

**From CloudShell:**

```
aws logs tail <LogGroupName> --follow --filter-pattern ERROR
```

**Logs Insights** (CloudWatch → Logs → Logs Insights, pick the log group):

```
fields @timestamp, route, statusCode, latencyMs
| filter level = "ERROR"
| sort @timestamp desc
| limit 50
```

p95 / p99 latency per minute:

```
filter route != "/api/health"
| stats count(*) as requests, pct(latencyMs, 95) as p95, pct(latencyMs, 99) as p99 by bin(1m)
```

Slow or failing pages:

```
filter route != "/api/health"
| stats count(*) as requests, sum(statusCode >= 500) as errors, pct(latencyMs, 95) as p95 by route
```

Thrown errors (plain text, so `level = "ERROR"` doesn't find them):

```
fields @timestamp, @message
| filter @message like /\[ERROR\]/
| sort @timestamp desc
| limit 20
```

## Alarms

CloudWatch → **Alarms**. No emails: an alarm turns red here. Both go off when 2 of the
last 3 minutes are bad, and go back to OK by themselves once it's fixed.

| Alarm                         | Watches                                                                 | First look                                                      |
| ----------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| `astro-blog-server-errors`    | 5xx responses in the JSON logs (metric `AstroBlog/ServerErrors`)        | Logs Insights "Slow or failing pages" above, to see which route |
| `astro-blog-unhealthy-copies` | Copies failing `/api/health` (the load balancer's `UnHealthyHostCount`) | ECS → service → **Events**, then the log group without a filter |

`astro-blog-server-errors` doesn't count routes that throw an error, as they write no JSON
line (see above). If one breaks `/api/health`, `astro-blog-unhealthy-copies` goes off instead.

## Roll back to the previous version

A rollback needs an older image in this session's repository, as every session starts
empty. To have one, run **Infra Up** once, merge a change, then run **Infra Up** again:
each deploy registers a new task definition revision pointing at its image, and the
older revision stays available.

Pointing the service back at the previous revision is the fastest way (no build, no
CloudFormation). In CloudShell:

```
C=<ClusterName>; S=<ServiceName>

# What's running now, and the latest revisions of the same task definition
CURRENT=$(aws ecs describe-services --cluster "$C" --services "$S" --query 'services[0].taskDefinition' --output text)
FAMILY=$(echo "$CURRENT" | sed -E 's#.*/([^:]+):[0-9]+$#\1#')
aws ecs list-task-definitions --family-prefix "$FAMILY" --sort DESC --query 'taskDefinitionArns[:3]'

# Check which image a revision runs (the label is the commit ID or version)
aws ecs describe-task-definition --task-definition <revision ARN> --query 'taskDefinition.containerDefinitions[0].image'

# Roll back to the previous revision and wait until it's done
aws ecs update-service --cluster "$C" --service "$S" --task-definition <previous revision ARN>
aws ecs wait services-stable --cluster "$C" --services "$S"
curl -s -o /dev/null -w '%{http_code}\n' <SiteUrl>/api/health
```

The new copies start next to the broken ones and only take over once they pass
`/api/health`, so the site isn't down while rolling back (about 60–90 seconds).

Afterwards the stack still says the newer image, so the next **Infra Up** deploys the
newest commit again. Fix the bug on a branch first.

If a broken version fails its health checks during a deploy, ECS rolls it back by
itself (the circuit breaker), and **Infra Up** fails.

## End the session

GitHub → **Actions → Infra Down → Run workflow**. It deletes the SSR stack, then the ECR
repository and its images, and fails if anything is left. The static v1.0.0 site
(`https://static.fionnmowlds.website`), the Route 53 zone and the certificate stay. Check **Billing** the next day if in doubt.

## When something goes wrong

| Symptom                                                                 | Likely cause and fix                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Infra Up fails straight away at `ec2:DescribeAvailabilityZones`         | CDK couldn't look up the availability zones; check the role can assume the `cdk-*` lookup role                            |
| ECS events say `unable to pull secrets` / `ResourceInitializationError` | A Parameter Store name is missing or misspelled; check the names above                                                    |
| Copies keep stopping, target group shows `unhealthy`                    | The app fails `/api/health` or crashes at start; read the log group without a filter                                      |
| Rowing page empty, `?deep=1` fails                                      | Supabase is paused (free tier, after 7 days) or the URL/key parameters are wrong; restore it in the Supabase dashboard    |
| `blog.` or `lb.` doesn't open after Infra Up                            | DNS still remembers the name as missing (up to 15 minutes, or 1 with the SOA change above); use the CloudFront address    |
| CloudFront shows `502 Bad Gateway`                                      | It can't reach `lb.` over HTTPS: check the `lb.` record exists and the load balancer's HTTPS listener has the certificate |
| Infra Down fails                                                        | Run it again; if a stack is stuck, delete it in **CloudFormation** and check the ECR repository `astro-blog` is gone      |

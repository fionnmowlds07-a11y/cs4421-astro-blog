# How I work on this project

I plan and track everything on my GitHub board ([Kanban board for blog project](https://github.com/users/fionnmowlds07-a11y/projects/2)) and every change goes through an issue, a branch and a PR.

## Workflow for every change

1. **Issue first.** Write it with the User story template: a user story, Given/When/Then scenarios and a Definition of Done. Add labels (`type:` and `area:`), the epic milestone, a priority and a size.
2. **Board.** It lands in Backlog. When it meets the Definition of Ready it moves to Ready, and when I start it it moves to In progress.
3. **Branch.** Made from an up-to-date `main` and named after the issue, e.g. `98-add-issue-and-pr-templates-and-write-down-my-process`.
4. **Small commits.** One change per commit, using conventional commits with the issue number, e.g. `feat(rowing): add the erg session form (#92)`. Types I use: `feat`, `fix`, `test`, `docs`, `ci`, `build`, `refactor`, `chore`.
5. **Pull request.** Uses the PR template and starts with `Closes #<issue>`. The issue moves to In review.
6. **CI.** `main` is protected, so a PR can only be merged when CI passes:
   - `test-and-lint`: lint, unit tests, Docker build, then the Cucumber BDD tests against the running container
   - `db-test`: builds the database from the migrations, lints it and runs the pgTAP tests
   - `cdk-test`: tests the AWS infrastructure code
7. **Merge.** Merging closes the issue and the board moves it to Done. Then I switch back to `main`, pull and delete the branch.

## Definition of Ready

An issue is Ready when:
- it has a user story and at least one Given/When/Then scenario
- it's small enough to finish in a few days (otherwise split it)
- it has labels, an epic, a priority and a size
- nothing is blocking it (if it's blocked, it stays in Backlog with a comment saying why)

## Definition of Done

An issue is Done when:
- it was done on its own branch with small commits that reference the issue
- tests were added or updated, and CI passes (lint, unit, BDD, database, CDK)
- there are no secrets in the code, build or Docker image
- the PR says `Closes #<issue>` and is merged into main

## Kanban

I run the board as Kanban rather than in sprints, because that's how I actually work on this project.

- **Pulling work:** when I finish something I take the next issue from the top of Ready (P0 first).
- **WIP limit:** at most 2 issues in In progress at once, so I finish things before starting new ones.
- **Blocked work:** anything blocked goes back to Backlog with a comment saying why.

## History

I started the board as a Scrum board with 2-week sprints and switched to Kanban. The Iteration field is still on the board so earlier work stays grouped by when it was finished.

- **Iteration 3 (12–25 Oct):** Get the rowing section's foundations in (Supabase, tables + security, admin login), then get the site deployed. Create rowing analysis with the OpenAI API. Ensure tests run functionally and embed Playwright e2e tests.

## Other decisions

Bigger technical decisions are written up as ADRs in [docs/adr](adr/).

# How I work on this project

I plan and track everything on my GitHub board ([Scrum board for blog project](https://github.com/users/fionnmowlds07-a11y/projects/2)) and every change goes through an issue, a branch and a PR.

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
- it's small enough to finish in one sprint (otherwise split it)
- it has labels, an epic, a priority and a size
- nothing is blocking it (if it's blocked, it stays in Backlog with a comment saying why)

## Definition of Done

An issue is Done when:
- it was done on its own branch with small commits that reference the issue
- tests were added or updated, and CI passes (lint, unit, BDD, database, CDK)
- there are no secrets in the code, build or Docker image
- the PR says `Closes #<issue>` and is merged into main

## Sprints

Sprints are 2 weeks long and are set up as iterations on the board.

- **Start of a sprint:** pick issues from the top of the backlog (P0 first) and write a sprint goal.
- **During the sprint:** keep the board up to date. Anything blocked goes back to Backlog with a comment.
- **End of a sprint:** write a short retro: what got done, what didn't and why, and one thing to change next time. Anything unfinished goes back to the backlog or into the next sprint.

Sprint goals and retros are written below.

## Sprint log

### Iteration 3 (12–25 Oct)

**Goal:** Get the rowing section's foundations in (Supabase, tables + security, admin login) and set the project up properly as a Scrum board, then get the site deployed. Create rowing analysis with the OpenAI API. Ensure tests run functionally and embed Playwright e2e tests.

**Retro:** to do at the end of the sprint.

## Other decisions

Bigger technical decisions are written up as ADRs in [docs/adr](adr/).

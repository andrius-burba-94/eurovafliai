# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues on
`andrius-burba-94/eurovafliai`. Use the `gh` CLI for all operations — it infers
the repo from `git remote -v` when run inside the clone.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

## Project conventions on top of the defaults

- Tickets are **vertical slices**, one per PR, named after the blueprint slice
  they implement (e.g. "2.2 Engine: buildPickOrder for linear/snake/3RR").
- A ticket that touches PocketBase says which migration it adds; a ticket with
  more than one write states its failure-recovery story (the PR template
  enforces this at merge time).
- The blueprint (`docs/EUROVAFLIAI_BLUEPRINT.md`) is the backlog of record for
  *what* gets built. Issues are the working surface for *how*, and they link back
  to the blueprint section they serve.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

The repository is **public**, but the project is not open to contributions: it
is one friend group's private app, and the repo is public so that GitHub's
branch protection, rulesets and secret scanning are available at all. There is
no `LICENSE`, so the default applies — all rights reserved, look but do not
reuse.

Consequences for triage: every PR is the maintainer's own work and never enters
the triage queue. An unsolicited external PR or issue is closed, not triaged.
If that ever changes, flip the flag above to `yes` and add a `LICENSE` and a
`CONTRIBUTING.md` in the same PR — `/triage` reads the flag, and contributors
need to know the terms.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: an issue labelled `wayfinder:map` holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`).
- **Blocking**: GitHub's native issue dependencies. `gh api --method POST repos/andrius-burba-94/eurovafliai/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/andrius-burba-94/eurovafliai/issues/<n> --jq .id`, not the `#number` or `node_id`). Fall back to a `Blocked by: #<n>` line in the child body if dependencies aren't available.
- **Frontier query**: list the map's open children, drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, `gh issue close <n>`, then append a context pointer to the map's Decisions-so-far.

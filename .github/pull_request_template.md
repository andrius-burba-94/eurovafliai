## What this slice does

<!-- One slice per PR. Link the ticket: Closes #123 -->

## How to verify

<!-- Exact steps a reviewer follows locally. Include the URL/route touched. -->

## Checklist

- [ ] `npm run lint && npm run typecheck && npm run test && npm run build` pass locally
- [ ] **`docs/STATUS.md` updated** — slice state, and anything this PR deferred
- [ ] Schema changes are **migration files** in `pb/pb_migrations/`, committed here
- [ ] Multi-write server actions state their **failure-recovery story** below
- [ ] Engine code (`src/lib/engine/`) has **zero PocketBase imports** and new tests
- [ ] `.env.example` updated if a new env var was added

### UI slices only

- [ ] Mobile-first: verified at 375px and desktop
- [ ] `prefers-reduced-motion` respected
- [ ] Empty state, loading state and error state all handled
- [ ] `/impeccable critique` run and findings addressed or logged

## Failure-recovery story

<!-- Required for anything that writes more than one record. PocketBase has no
transactions. State: what happens if write 1 succeeds and write 2 fails, what
repairs it (worker? next request? commissioner action?), and which unique index
backs it up. Write "single write" if not applicable. -->

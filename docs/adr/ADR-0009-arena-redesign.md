# ADR-0009: The arena interface

Date: 2026-09-28
Status: accepted; implementation in review

## Context

The draft engine and season scoring work, but the midnight board reads like a statistics page. The league needs a faster way to arrange a five, follow a game and understand a round. The user approved a site-wide interactive concept after reviewing desktop and phone layouts, then asked us to continue into code. The concept is a visual reference with demo data, not a source of league rules.

## Decision

- Keep the sidebar and its distinct **League**, **Drafts**, **EuroLeague** and **Manage** sections. League includes League Home, My Team, Lineup, Matchday, Standing, Recap and Trades. Drafts includes Draft Room, Draft Order, Cheat Sheet and Export when those destinations exist and the viewer may open them. Mobile uses Lineup, Players, Matchday, League and More during the season.
- Use a slate canvas, quiet framed surfaces, restrained cyan for active actions, emerald for positive change, crimson for problems and gold for captaincy or caution. Text and labels carry meaning as well as color. Small control corners and circular court markers are permitted; large glows and decorative gradients are not.
- The lineup is a fixed-ratio half court with separate center, forward and guard rows. The five legal G/F/C formations are 1-2-2, 1-3-1, 2-1-2, 2-2-1 and 3-1-1. The grid is an alternate reading of the same state. A local draft survives refresh, while only the existing server action records a lineup. Auto-Optimize is a reviewable estimate, never an automatic write.
- The player pool is searchable and filterable. Comparison uses stored games and the existing easy/even/hard fixture scale. Trades remain commissioner-recorded agreements under exclusive draft ownership; no salary-cap cart or credits are introduced.
- Matchday snapshots are a separate derived collection. A bounded worker polls the official live box score at one-minute cadence only during scheduled game windows. Clients read and subscribe; the finished-game ingest and standings snapshots remain authoritative. Live figures and ranks say **provisional** and display freshness. `LIVE_FETCH` stays off until a real in-game response is observed changing during an actual game.
- Fantasy season navigation begins with E2026. E2025 player history remains available for research and draft estimates.

## Consequences

The common shell, tokens, lineup, player pool, trade builder, standings, recap and draft room share one visual language. A stale feed is visible as stale, and the last derived snapshot survives a worker interruption. The unique season/game index and idempotent upsert repair partial polling writes without a PocketBase transaction. When the live feed or subscription is unavailable, matchday still shows stored fixtures and finished scores.

The new `DESIGN.md` current contract supersedes conflicting visual rules in ADR-0006 and the earlier body of that document. ADR-0008's sidebar decision remains in force. The E2025 fantasy change does not remove historical statistics.

The later [ADR-0010](ADR-0010-official-media.md) adds permitted official player portraits and club marks without changing this interface's game rules or palette.

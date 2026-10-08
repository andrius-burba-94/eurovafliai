# BasketNews Fantasy transfer log

Checked against the real service on **9 October 2026**, without a session.
GraphQL at `https://fantasy.basketnews.com/backend/graphql`; introspection is
disabled, but "Did you mean" suggestions are on, which is how these field names
were found. Not read by the sync yet (see STATUS.md, debt).

`draftTransfersFromClient(fantasyLeagueId: String!, fantasyRound: Int!)` →
`[DraftTrade]`, public: an unknown league answers `fantasyLeagueNotFound`, not
an auth error.

- `DraftTrade`: `id`, `type` (`free_agent` seen), `status` (`accepted` seen),
  `createdAt`, `updatedAt`, `fantasyLeagueId`, `offer`, `request`.
- `offer` / `request`: `DraftTradeItem { id, fantasyTeamId, fantasyTeam { id title }, players }`.
  A free-agent swap has a null `request` team.
- `players`: `[DraftTradePlayer] { playerId, player { id firstName lastName } }`.
- `fantasyRound` looks like the round a transfer was made in, so a round's
  moves sit under the round before. The Hostinger league
  (`6ab26b799050fb90221bb263`) returned moves for rounds 1–3 and none for 4–6
  on 9 October. Round 3's six free-agent swaps were all `updatedAt`
  7 October 15:49 UTC: processed together, created between 3 and 7 October.

# Commissioner pages — critique and distill, 8 October 2026

Surfaces: `/players/mapping`, `/stats/import`, `/players/import`,
`/l/<league>/draft` (finished). Mode: Operate. Checked at 1280×900 and 375×812
on the local database, dark ground.

## Findings

| Surface | Finding | Severity | Change |
|---|---|---|---|
| Mapping | A three-sentence intro restated the three section headings below it. | P2 | Gone; the lead says rosters now sync by themselves and when the pool last moved. |
| Mapping | Every rename was a tall two-card block (In the pool ? In the feed) with a paragraph per group; 10 renames took four screens. | P1 | One row per question: pool name → feed name, club, reason, answers on the right. About 40px a row on a laptop. |
| Mapping | Every row painted the live orange field, so the "current question" outline had nothing to stand out from. | P2 | Live field on the current row only; the rest wait. |
| Mapping | Section explanations as paragraphs under headings (DESIGN.md: "never a paragraph under a heading"). | P2 | Behind each section's info tip. |
| Mapping | Copy told the commissioner to "sync the rosters" by hand. | P2 | Says the roster sync adds the player once the feed lists him. |
| Stats import | Lead framed pasting as the workflow; the worker has imported every game since 4.3. | P2 | Lead says paste only when the feed is down or a box score was amended. |
| Stats import | Stored overview was two stat slots and five batch slots before the form. | P3 | One sentence with the latest import; earlier imports folded. |
| Roster import | Authority switch and its paragraph sat above the paste box, the thing a visitor came to do. | P2 | Paste first, plan second, authority as one line at the foot. |
| Draft (finished) | The pool column hides when complete, but the grid kept it, so the board was squeezed into the right third beside empty space. | P1 | One column: the board spans the room. |
| Draft (finished) | The radar showed every roster full; the room's chat repeated League Home's. | P2 | Both shown only while drafting. |
| Draft (finished) | Commissioner tools: a framed `DraftControls` bank inside a bordered `details` card (panel in panel). | P2 | The fold is a plain ruled disclosure. |
| Draft (finished) | The band stayed sticky with no clock to keep in view. | P3 | Sticky only while drafting. An imported league says "Imported from BasketNews". |

Detector: no findings on the changed files.

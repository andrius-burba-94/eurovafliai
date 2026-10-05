# Player mapping — 5 October 2026

The commissioner identified the familiar names behind six passport-name records:
Mike James, PJ Dozier, TJ Shorts, Talen Horton-Tucker, Nikola Djurisic and Alex
Len. The production news slugs were attached to those exact player ids through
the existing `attachSlug` store function. The displayed name is now resolved
by `displayName` and `surname`; the stored `name`, `name_normalized` and person
code are unchanged so EuroLeague ingestion keeps its exact joins.

The commissioner also identified Bandja Sy (`005793`), Bryant Dunston
(`003048`) and Nick Smith Jr (`015244`) against today's EuroLeague roster feed.
All three were absent from the pool. A read-only roster diff found four possible
additions, 287 existing rows with updates (mostly biography fields), no
departures and no suspected renames. A targeted operation added only the three
confirmed feed rows with the same fields and unique-index guards as roster
import. Re-fetching games 11, 14, 18, 22, 23 and 28 created six missing stat
lines, found 138 already stored lines and reported no problems. The news names
for those three, both published slugs for Nick Smith, and A.J. Lawson were then
attached to the correct records. A.J. Lawson is the active coded Anthony Lawson
row with draft and stat references, not the older codeless row marked left.

Afterward the mapping queue had zero suspected renames and zero unattached
E2026 box-score codes. George Papas and Lorenzo Brown remain as the two
unmatched news names; neither appears in the current pool or roster feed, and
the commissioner chose to leave them unmatched. No source file or schema was
edited on the VPS. Repeating a targeted operation checks the person code and
player identity first, so an interrupted run can be verified and resumed
without creating another player. The news attachments are idempotent by slug;
the six game re-import is idempotent by the stored stat unique index.

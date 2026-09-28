# ADR-0010: Official EuroLeague imagery on the personal VPS

Date: 2026-09-28
Status: accepted; installation verified, application rollout in review

## Context

The arena concept uses official team marks and player portraits. The user supplied written permission for non-commercial use of both and confirmed that Eurovafliai is non-commercial. The previous no-headshot decision in ADR-0009 and the older dashboard notes described the evidence available before this permission and source mapping existed.

## Decision

- Match portraits by the roster's `person_code` and club marks by `club_code`, using the official 2026–27 roster pages and supplied team-logo hub. The source manifest contains URLs only. Generic official placeholder pictures are excluded; their players use a clear letter fallback.
- Download the 318 portraits and 20 marks directly onto the personal VPS under `/srv/eurovafliai-media/E2026`. Portraits use official 160px WebP variants to keep lineup and pool pages light; club marks remain PNG. The installer validates source hosts, response formats and file signatures, writes atomically and can be run again safely. No official image bytes enter Git or the local interactive preview.
- Serve those files through a narrow read-only `/media/E2026/...` route. The route validates every path segment and returns a cacheable image or a 404. Names and controls remain usable if a picture is missing.
- Keep the interactive local preview as a fictional, demo-only design artifact. The production app reads real roster and stats data; the preview does not.

## Consequences

The site gains player and club identity in the lineup, pool, team, dashboard, draft and matchday. Photo availability follows the official source: a player without a current portrait stays legible and does not acquire an invented likeness. VPS storage is independent of application deploys and can be refreshed from the committed manifest. The non-commercial permission is a condition of using these assets; a later commercial change would require a new rights review.

---
name: comment-discipline
description: Comment discipline — minimal, intentional comments only. Use whenever writing, editing, or reviewing code, to decide when a comment is warranted and which existing comments must be preserved.
---

# Comment discipline

- Write self-documenting code; prefer clear names over comments.
- Add comments ONLY for non-obvious "why" (rationale, caveats, edge cases,
  a workaround for a specific PocketBase or Next quirk). Never restate what
  the code does.
- No comments that narrate edits ("added X", "changed Y", "renamed for the
  animation").
- Do NOT delete or rewrite existing comments unless they are now factually
  wrong.
- Never remove TODO/FIXME or any comment prefixed with `@keep`.
- Preserve existing exported-function docblocks.
- Gotchas already recorded in skills do not need to be pasted next to every
  call site. One pointer is enough; a second copy will rot.

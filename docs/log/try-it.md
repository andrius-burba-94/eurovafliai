# Try it on localhost — closed phases

The hands-on notes for slices whose phase has closed, moved out of
`docs/STATUS.md`. The open phase's notes stay there. See [README.md](README.md).

## Try it on localhost — slice 3.7

```bash
npm run dev            # Next :3007 + PocketBase :8095
npm run rosters:sync   # once, if the pool is empty
```

Sign in, roll the order, start the draft and enter the room. Then:

- **Tap a player's `Choose`.** Nothing is drafted. The row is struck in marker
  and the sticky band at the top now offers `Draft <Name>` and `Cancel`.
- **Double-tap `Choose` as fast as you can.** Still nothing drafted — that is
  the gesture the whole design exists to stop, and the confirm is in the band so
  it cannot be reached by it.
- **Press Escape.** The player is put back and focus returns to the search box.
- **Now `Draft <Name>`.** It lands on the board through the ordinary pipeline.
- **Turn `Sound off` into `Sound on`**, then hand the clock to somebody else and
  take it back (`npm run seed:members -- <invite-code> 1`, sign in as them in a
  private window, and pick). Two short notes when it comes round to you. Reload:
  the toggle remembers.
- **With a screen reader**, or by inspecting `[data-testid="clock-said"]`: it
  says "Your turn. Pick N, round N." when it is yours, and is **empty** when it
  is not.

## Try it on localhost — slice 3.5

```bash
npm run dev            # Next :3007 + PocketBase :8095
npm run rosters:sync   # once, if the pool is empty
```

Sign in, open a league, and look at the foot of the lobby: **League chat**,
collapsed, with one line of the latest thing that happened. Then:

- **Roll the order.** The collapsed header shows the whole order, numbered,
  without you opening anything.
- **Open it and say something.** Now open the same league in a second browser
  signed in as another member (`npm run seed:members -- <invite-code> 1`, then a
  private window). Type in one and watch it appear in the other **with no
  reload** — that is the one claim this slice rests on.
- **Send twice in a second.** The second is refused with a sentence, and your
  text is handed back rather than swallowed.
- **Delete your own message.** It becomes "Message deleted" with your team name
  still on it. Try to find a delete on a system line: there is none.
- **Start the draft, make a pick, then pause and roll back.** Each announces
  itself. The rollback line is the one to read.

The room has no *Recent picks* ticker any more — chat replaced it. The board
above still holds every pick.

## Try it on localhost — slice 3.4b

```bash
npm run dev            # Next :3007 + PocketBase :8095
npm run rosters:sync   # once, if the pool is empty
```

Sign in, open a league, **Your cheat sheet**, and paste a few surnames if you
have no sheet yet. Then, in **Your ranking**:

- **Tap a row.** It is struck in 2px dashed ink and a bar appears at the bottom
  of the screen with every verb on it.
- **Press ↑ twice quickly.** It must move *two* places. That is the one thing
  worth looking at, because the first version moved one — a nudge computed as an
  absolute rank resolves to the same destination both times.
- **Tap a different row** to drop the held one there, or **drag** the held row.
  Try the drag with a mouse *and* with the device toolbar in touch mode; the
  list must still scroll while a row is held.
- **Remove** a player, and **New tier** to break the sheet where you are
  standing. Reload: all of it is still there.

Then check the paste box below has followed you — it should read back the order
you just made, not the one you started with.

## Try it on localhost — slice 3.4a

```bash
npm run dev            # Next :3007 + PocketBase :8095
npm run rosters:sync   # once, if the pool is empty
```

Sign in, open a league, **Your cheat sheet**. Paste a few surnames — misspelled
is fine — press *Read the list*, then *Save this sheet*. Reopen the page: the
box holds your sheet as `rank, tier, name`, and it is editable.

Then roll the order and start the draft. In the room the pool is in **your**
order with `#1…#8` down the left, and the board sits close to the top. Type a
name or pick a club and "Best on your sheet" appears above the search.

To see autodraft use it: `npm run worker:dev`, press *Draft for me*, and the
log line names the pick and its place on your sheet.

---


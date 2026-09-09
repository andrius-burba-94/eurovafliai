/**
 * Scripted draft night: eight signed-in rooms, real taps, real autodraft.
 *
 *   npm run rehearsal   # with `npm run dev` already up
 *
 * Local only. Plants a league, 8 members, 120 pool players, then drives five
 * Pixel 7 contexts and three desktop ones through lobby → roll → start →
 * 104 picks. Two members autodraft on purpose, one never taps (deadline),
 * the rest pick through the pool confirm. One pause, one rollback, one chat
 * line. Measures how long the last peer takes to show each filled slot.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  chromium,
  devices,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import PocketBase from "pocketbase";

import { parseServerEnv } from "../src/lib/config/schema";
import { toState } from "../src/lib/drafts/pipeline";
import type { DraftRecord, PickRecord } from "../src/lib/drafts/types";
import {
  openPositions,
  whoIsOnClock,
  type EnginePick,
  type Position,
} from "../src/lib/engine";
import { DEFAULT_ROSTER_TEMPLATE } from "../src/lib/leagues/settings";
import { sweepOnce } from "../src/worker/sweep";
import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  signIn,
  superuser,
  type TestUser,
} from "../tests/e2e/helpers/session";

const BASE = "http://localhost:3007";
const OUT = ".impeccable/review/rehearsal";
const MEMBERS = 8;
const PHONES = 5;
const TOTAL_PICKS = 8 * 13;
const POOL = { G: 46, F: 46, C: 28 } as const;

const env = parseServerEnv(process.env);
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(env.PB_INTERNAL_URL)) {
  console.error(
    `Refusing to rehearse against ${env.PB_INTERNAL_URL}. Local PocketBase only.`,
  );
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const PROGRESS = resolve(OUT, "progress.log");
writeFileSync(PROGRESS, "");

function log(message: string): void {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  appendFileSync(PROGRESS, `${line}\n`);
}

type Seat = {
  user: TestUser;
  memberId: string;
  kind: "ui" | "auto" | "silent";
  device: "phone" | "desktop";
  context: BrowserContext;
  page: Page;
};

type Sample = {
  overall: number;
  kind: Seat["kind"];
  device: Seat["device"];
  ms: number;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[i]!;
}

async function filledCount(page: Page): Promise<number> {
  return page.locator('[data-board-slot][data-state="filled"]').count();
}

async function tapPick(
  page: Page,
  playerId: string,
  needle: string,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const cancel = page.getByTestId("confirm-pick-cancel");
    if (await cancel.isVisible().catch(() => false)) {
      await cancel.click();
    }
    await page.getByTestId("pool-search").fill(needle);
    const choose = page.getByTestId(`pick-${playerId}`);
    await expect(choose).toBeVisible({ timeout: 15_000 });
    await choose.click({ force: true });
    const go = page.getByTestId("confirm-pick-go");
    if (await go.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const clicked = await go
        .click({ force: true, timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (clicked) return;
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("draft-room")).toBeVisible({
      timeout: 30_000,
    });
  }
  throw new Error(`pick ${playerId} would not arm`);
}

async function waitStatus(
  pb: PocketBase,
  leagueId: string,
  status: string,
  timeoutMs: number,
): Promise<void> {
  await expect
    .poll(async () => (await readDraft(pb, leagueId)).status, {
      timeout: timeoutMs,
    })
    .toBe(status);
}

async function setPaused(
  chief: Seat,
  pb: PocketBase,
  leagueId: string,
  paused: boolean,
): Promise<void> {
  const wanted = paused ? "paused" : "live";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if ((await readDraft(pb, leagueId)).status === wanted) return;
    const btn = chief.page.getByTestId("draft-pause");
    await expect(btn).toContainText(
      paused ? /Pause the draft/i : /Resume the draft/i,
      { timeout: 15_000 },
    );
    await btn.click();
    const landed = await expect
      .poll(async () => (await readDraft(pb, leagueId)).status, {
        timeout: 8_000,
      })
      .toBe(wanted)
      .then(() => true)
      .catch(() => false);
    if (landed) return;
    await chief.page.reload({ waitUntil: "domcontentloaded" });
    await expect(chief.page.getByTestId("draft-room")).toBeVisible({
      timeout: 30_000,
    });
  }
  throw new Error(`draft would not become ${wanted}`);
}

async function waitFilled(
  seats: Seat[],
  want: number,
  timeoutMs: number,
  picker?: Page,
): Promise<number> {
  const started = Date.now();
  let last = 0;
  const watchers = picker
    ? seats.filter((seat) => seat.page !== picker)
    : seats;
  while (Date.now() - started < timeoutMs) {
    const counts = await Promise.all(
      watchers.map((seat) => filledCount(seat.page)),
    );
    last = Math.min(...counts);
    if (counts.every((n) => n >= want)) return Date.now() - started;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Peers still at ${last} filled slots, wanted ${want}`);
}

async function failShot(seats: Seat[], label: string): Promise<void> {
  await Promise.all(
    seats.map((seat, i) =>
      seat.page.screenshot({
        path: resolve(OUT, `${label}-${i}-${seat.kind}-${seat.device}.png`),
        fullPage: true,
      }),
    ),
  );
}

async function readDraft(pb: PocketBase, leagueId: string): Promise<DraftRecord> {
  const rows = await pb.collection("drafts").getFullList<DraftRecord>({
    filter: `league = '${leagueId}'`,
    sort: "-id",
    requestKey: null,
  });
  const draft = rows[0];
  if (!draft) throw new Error("no draft");
  return draft;
}

async function readPicks(pb: PocketBase, draftId: string): Promise<PickRecord[]> {
  return pb.collection("picks").getFullList<PickRecord>({
    filter: `draft = '${draftId}'`,
    sort: "overall_no",
    requestKey: null,
  });
}

function asEngine(picks: readonly PickRecord[]): EnginePick[] {
  return picks.map((pick) => ({
    id: pick.id,
    overallNo: pick.overall_no,
    memberId: pick.member,
    playerId: pick.player,
  }));
}

async function assertClock(seats: Seat[], onMemberId: string): Promise<void> {
  const onSeat = seats.find((s) => s.memberId === onMemberId);
  if (!onSeat) throw new Error("on-clock member has no seat");
  await expect
    .poll(
      async () => {
        const texts = await Promise.all(
          seats.map((seat) =>
            seat.page.getByTestId("on-the-clock").innerText(),
          ),
        );
        const yours = texts.filter((t) => /You are on the clock/i.test(t));
        const mine = await onSeat.page.getByTestId("on-the-clock").innerText();
        return yours.length === 1 && /You are on the clock/i.test(mine)
          ? 1
          : 0;
      },
      { timeout: 20_000 },
    )
    .toBe(1);
}

async function nextLegal(
  pool: { id: string; name: string; position: Position }[],
  taken: Set<string>,
  roster: Position[],
): Promise<{ id: string; name: string; position: Position }> {
  const open = openPositions(
    roster.map((position) => ({ position })),
    DEFAULT_ROSTER_TEMPLATE,
  );
  const hit = pool.find((p) => !taken.has(p.id) && open.includes(p.position));
  if (!hit) throw new Error(`no legal player left (open ${open.join(",")})`);
  return hit;
}

const startedAt = Date.now();
const samples: Sample[] = [];
let autopicked = 0;
const reported = new Set<string>();
const seats: Seat[] = [];
let browser: Browser | undefined;

try {
  const ping = await fetch(BASE, {
    redirect: "manual",
    signal: AbortSignal.timeout(3000),
  }).catch(() => null);
  if (!ping || ping.status >= 500) {
    console.error(`Nothing at ${BASE}. Start npm run dev first.`);
    process.exit(1);
  }

  log("starting rehearsal");
  const commissioner = await createTestUser("reh-chief");
  const others = await Promise.all(
    Array.from({ length: MEMBERS - 1 }, (_, i) => createTestUser(`reh-${i + 2}`)),
  );
  const users = [commissioner, ...others];
  const league = await createLeagueFor(commissioner, "Rehearsal Night");
  const memberIds = [
    (
      await (await superuser())
        .collection("league_members")
        .getFirstListItem<{ id: string }>(
          `league = '${league.id}' && user = '${commissioner.id}'`,
          { requestKey: null },
        )
    ).id,
  ];
  for (const user of others) {
    memberIds.push(await addMemberTo(league.id, user, ""));
  }

  const pb = await superuser();
  await pb.collection("league_members").update(
    memberIds[1]!,
    { autodraft_enabled: true },
    { requestKey: null },
  );
  await pb.collection("league_members").update(
    memberIds[2]!,
    { autodraft_enabled: true },
    { requestKey: null },
  );

  const pool: { id: string; name: string; position: Position }[] = [];
  const wanted = (
    Object.entries(POOL) as [Position, number][]
  ).flatMap(([position, n]) =>
    Array.from({ length: n }, (_, i) => ({ position, label: `R${position}${i}` })),
  );
  for (let i = 0; i < wanted.length; i += 10) {
    const batch = await Promise.all(
      wanted.slice(i, i + 10).map(async ({ position, label }) => {
        const row = await createPlayer(label, { position });
        return { id: row.id, name: row.name, position };
      }),
    );
    pool.push(...batch);
  }
  log(`pool ${pool.length} players`);

  browser = await chromium.launch({ headless: true });
  const kinds: Seat["kind"][] = [
    "ui",
    "auto",
    "auto",
    "silent",
    "ui",
    "ui",
    "ui",
    "ui",
  ];

  for (let i = 0; i < MEMBERS; i += 1) {
    // Commissioner on desktop so pause/undo are a real tap, not a scroll hunt.
    // Five phones, three desktops still.
    const device = i === 0 || i > PHONES ? "desktop" : "phone";
    const options =
      device === "phone"
        ? { ...devices["Pixel 7"], reducedMotion: "reduce" as const }
        : {
            viewport: { width: 1440, height: 900 },
            reducedMotion: "reduce" as const,
          };
    const context = await browser.newContext(options);
    context.setDefaultTimeout(30_000);
    context.setDefaultNavigationTimeout(45_000);
    await signIn(context, users[i]!);
    const page = await context.newPage();
    seats.push({
      user: users[i]!,
      memberId: memberIds[i]!,
      kind: kinds[i]!,
      device,
      context,
      page,
    });
  }

  log("lobby: team names and ready");
  for (const seat of seats) {
    await seat.page.goto(`${BASE}/leagues/${league.id}`);
    await expect(seat.page.getByTestId("lobby")).toBeVisible({ timeout: 20_000 });
    await seat.page.getByTestId("team-name-input").fill(`${seat.user.name} FC`);
    await seat.page.getByTestId("save-team-name").click();
    await expect(seat.page.getByTestId("save-team-name")).not.toHaveAttribute(
      "data-pending",
      "true",
      { timeout: 15_000 },
    );
    await seat.page.getByTestId("toggle-ready").click();
    await expect(seat.page.getByTestId("toggle-ready")).toContainText(
      /Not ready after all/i,
      { timeout: 15_000 },
    );
  }

  const chief = seats[0]!;
  log("lobby: pick seconds, roll, start");
  await chief.page.getByTestId("draft-pick-seconds").fill("15");
  await chief.page.getByTestId("draft-settings-save").click();
  await expect(chief.page.getByTestId("draft-roll")).toBeVisible({
    timeout: 15_000,
  });
  await chief.page.getByTestId("draft-roll").click();
  await expect(chief.page.getByTestId("start-draft")).toBeVisible({
    timeout: 20_000,
  });
  await chief.page.getByTestId("start-draft").click();
  await expect(chief.page.getByTestId("enter-draft")).toBeVisible({
    timeout: 20_000,
  });

  log("entering draft rooms");
  await Promise.all(
    seats.map(async (seat) => {
      await seat.page.goto(`${BASE}/leagues/${league.id}/draft`);
      await expect(seat.page.getByTestId("draft-room")).toBeVisible({
        timeout: 30_000,
      });
    }),
  );

  let pausedOnce = false;
  let rolledOnce = false;
  let chatted = false;

  while (true) {
    const draft = await readDraft(pb, league.id);
    if (draft.status === "complete") break;
    if (draft.status === "paused") {
      log("draft paused — resuming");
      await setPaused(chief, pb, league.id, false);
      continue;
    }

    const picks = await readPicks(pb, draft.id);
    const onClock = whoIsOnClock(toState(draft), asEngine(picks));
    if (!onClock) {
      await sweepOnce({
        pb,
        clock: () => new Date(),
        log: () => {},
        reported,
        onlyDraft: draft.id,
      });
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }

    const seat = seats.find((s) => s.memberId === onClock.memberId);
    if (!seat) throw new Error(`no seat for ${onClock.memberId}`);
    await assertClock(seats, onClock.memberId);

    if (!pausedOnce && picks.length === 8) {
      pausedOnce = true;
      log("pause + chat at 8 picks");
      await setPaused(chief, pb, league.id, true);
      await expect(chief.page.getByTestId("on-the-clock")).toContainText(
        /paused/i,
        { timeout: 20_000 },
      );
      if (!chatted) {
        chatted = true;
        const talker = seats[4]!;
        const toggle = talker.page.getByTestId("chat-toggle");
        if ((await toggle.getAttribute("aria-expanded")) !== "true") {
          await toggle.click();
        }
        await talker.page.getByTestId("chat-input").fill("The room is watching.");
        await talker.page.getByTestId("chat-send").click();
        await expect(talker.page.getByTestId("chat-run")).toContainText(
          "The room is watching.",
          { timeout: 15_000 },
        );
      }
      await setPaused(chief, pb, league.id, false);
      await expect(chief.page.getByTestId("on-the-clock")).toContainText(
        /on the clock/i,
        { timeout: 20_000 },
      );
      await waitStatus(pb, league.id, "live", 20_000);
    }

    if (!rolledOnce && picks.length === 16) {
      rolledOnce = true;
      log("rollback pick 16");
      if ((await readDraft(pb, league.id)).status === "live") {
        await chief.page.keyboard.press("Escape").catch(() => {});
        await setPaused(chief, pb, league.id, true);
      }
      await chief.page.getByTestId("draft-undo-toggle").click({ force: true });
      await expect(chief.page.getByTestId("draft-undo")).toBeVisible({
        timeout: 10_000,
      });
      await chief.page.getByTestId("draft-undo-target").fill("16");
      await chief.page.getByTestId("draft-undo").click({ force: true });
      const undoError = chief.page.getByTestId("draft-undo-error");
      await expect
        .poll(
          async () => {
            if (await undoError.isVisible().catch(() => false)) {
              throw new Error(await undoError.innerText());
            }
            const row = await readDraft(pb, league.id);
            return (await readPicks(pb, row.id)).length;
          },
          { timeout: 20_000 },
        )
        .toBe(15);
      await setPaused(chief, pb, league.id, false);
      continue;
    }

    const before = picks.length;
    if (seat.kind === "ui") {
      const taken = new Set(picks.map((p) => p.player));
      const roster = picks
        .filter((p) => p.member === seat.memberId)
        .map((p) => pool.find((pl) => pl.id === p.player)?.position)
        .filter((p): p is Position => Boolean(p));
      const choice = await nextLegal(pool, taken, roster);
      const needle = choice.name.split(",")[0]?.split(" ").pop() ?? choice.name;
      const t0 = Date.now();
      await tapPick(seat.page, choice.id, needle);
      await expect
        .poll(async () => (await readPicks(pb, draft.id)).length, {
          timeout: 45_000,
        })
        .toBeGreaterThan(before);
      const afterUi = (await readPicks(pb, draft.id)).length;
      await waitFilled(seats, afterUi, 90_000, seat.page);
      samples.push({
        overall: afterUi,
        kind: seat.kind,
        device: seat.device,
        ms: Date.now() - t0,
      });
      log(`#${afterUi} ${seat.kind}/${seat.device} ${samples.at(-1)!.ms}ms`);
      continue;
    } else {
      const until = Date.now() + 25_000;
      while (Date.now() < until) {
        const tick = await sweepOnce({
          pb,
          clock: () => new Date(),
          log: () => {},
          reported,
          onlyDraft: draft.id,
        });
        autopicked += tick.autopicked;
        const nowPicks = await readPicks(pb, draft.id);
        if (nowPicks.length > before) break;
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    const after = (await readPicks(pb, draft.id)).length;
    if (after <= before) {
      throw new Error(`pick ${before + 1} did not land (${seat.kind})`);
    }
    const t0 = Date.now();
    await waitFilled(seats, after, 90_000);
    samples.push({
      overall: after,
      kind: seat.kind,
      device: seat.device,
      ms: Date.now() - t0,
    });
    log(`#${after} ${seat.kind}/${seat.device} ${samples.at(-1)!.ms}ms`);
  }

  const finalDraft = await readDraft(pb, league.id);
  const finalPicks = await readPicks(pb, finalDraft.id);
  await expect
    .poll(
      async () =>
        pb.collection("roster_memberships").getFullList({
          filter: `league = '${league.id}'`,
          fields: "id",
          requestKey: null,
        }),
      { timeout: 60_000 },
    )
    .toHaveLength(TOTAL_PICKS);
  const memberships = await pb
    .collection("roster_memberships")
    .getFullList({
      filter: `league = '${league.id}'`,
      requestKey: null,
    });
  await expect
    .poll(
      async () =>
        pb.collection("chat_messages").getFullList<{ body: string }>({
          filter: `league = '${league.id}' && body ~ 'Rosters are set.'`,
          fields: "body",
          requestKey: null,
        }),
      { timeout: 30_000 },
    )
    .toHaveLength(1);
  const chat = await pb
    .collection("chat_messages")
    .getFullList<{ body: string }>({
      filter: `league = '${league.id}'`,
      requestKey: null,
    });
  const leagueRow = await pb
    .collection("leagues")
    .getOne<{ status: string }>(league.id, { requestKey: null });

  if (finalPicks.length !== TOTAL_PICKS) {
    throw new Error(`expected ${TOTAL_PICKS} picks, got ${finalPicks.length}`);
  }
  if (leagueRow.status !== "season") {
    throw new Error(`league status ${leagueRow.status}, wanted season`);
  }
  if (memberships.length !== TOTAL_PICKS) {
    throw new Error(`memberships ${memberships.length}, wanted ${TOTAL_PICKS}`);
  }
  const bodies = chat.map((row) => row.body).join("\n");
  if (!/rolled/i.test(bodies)) throw new Error("chat missing the roll");
  if (!/paused/i.test(bodies)) throw new Error("chat missing the pause");
  if (!/rolled the draft back/i.test(bodies)) {
    throw new Error("chat missing the rollback");
  }
  if (!/The room is watching/.test(bodies)) {
    throw new Error("chat missing the member line");
  }
  for (let overall = 1; overall <= TOTAL_PICKS; overall += 1) {
    if (!new RegExp(`at #${overall}, round `).test(bodies)) {
      throw new Error(`chat missing the pick at #${overall}`);
    }
  }

  const wall = Date.now() - startedAt;
  const byDevice = (d: Sample["device"]) => samples.filter((s) => s.device === d);
  const phone = byDevice("phone").map((s) => s.ms);
  const desktop = byDevice("desktop").map((s) => s.ms);
  const all = samples.map((s) => s.ms);
  const md = `# Rehearsal — scripted eight-client draft

Run locally with \`npm run rehearsal\` against \`npm run dev\`. Not a substitute
for eight friends in one room; it is the mechanical half of Phase 3.7 / D12:
104 picks, mixed devices, autodraft, a pause, a rollback, chat.

| | |
|---|---|
| Members | 8 (5 Pixel 7, 3 desktop) |
| Picks | ${finalPicks.length} |
| Autodraft writes | ${autopicked} |
| Wall time | ${(wall / 1000).toFixed(1)}s |
| Propagation p50 (all) | ${percentile(all, 50)} ms |
| Propagation p95 (all) | ${percentile(all, 95)} ms |
| Propagation p50 phone | ${percentile(phone, 50)} ms |
| Propagation p95 phone | ${percentile(phone, 95)} ms |
| Propagation p50 desktop | ${percentile(desktop, 50)} ms |
| Propagation p95 desktop | ${percentile(desktop, 95)} ms |
| League after | \`${leagueRow.status}\` |
| Roster memberships | ${memberships.length} |

Two members had autodraft armed. One never tapped; the worker took their
turns after the 15s clock. Pause at pick 8, rollback of pick 16 (then resume),
one member line in chat.

What stays human: whether draft night *feels* right on eight phones on a couch.
`;
  writeFileSync(resolve("docs/log/rehearsal.md"), md);
  console.log(md);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  log(`FAIL ${message}`);
  console.error(message);
  if (seats.length > 0) await failShot(seats, "fail").catch(() => {});
  process.exitCode = 1;
} finally {
  for (const seat of seats) {
    await seat.context.close().catch(() => {});
  }
  await browser?.close().catch(() => {});
  await cleanupTestData().catch((err) => {
    console.error("cleanup failed", err);
  });
  log("cleanup done");
}

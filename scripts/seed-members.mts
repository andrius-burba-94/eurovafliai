/**
 * Fill a league with stand-in members, so a draft can be tested by one person.
 *
 *   npm run seed:members -- <invite-code|league-id> [count]
 *   npm run seed:members -- ABC123XY 5      # five stand-ins
 *   npm run seed:members -- ABC123XY --undo # remove them again
 *
 * The draft needs at least two members before it will roll an order or start,
 * which is right for a real league and inconvenient when you are the only
 * person at the keyboard. This creates real users and real memberships — not a
 * special case inside the app — so everything downstream (the roll, the board,
 * autodraft in 2.5) sees exactly what it would see on draft night.
 *
 * Stand-ins are named `Seeded <n>` and use `@seed.invalid` addresses, which is
 * how `--undo` finds them again. A reserved TLD, so a stray one can never
 * receive mail.
 *
 * Refuses to run against anything but a local PocketBase. These are fake
 * accounts with a known password; they have no business on the VPS.
 */
import PocketBase from "pocketbase";

import { parseServerEnv } from "../src/lib/config/schema";
import type { LeagueRecord, MemberRecord } from "../src/lib/leagues/types";

const SEED_DOMAIN = "seed.invalid";
const SEED_PASSWORD = "seeded-member-password";

const env = parseServerEnv(process.env);
const url = env.PB_INTERNAL_URL;

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
  console.error(
    `Refusing to seed against ${url}. This script creates fake accounts with a ` +
      "known password and is for a local database only.",
  );
  process.exit(1);
}

const [target, ...rest] = process.argv.slice(2);
const undo = rest.includes("--undo");
const count = Number(rest.find((arg) => !arg.startsWith("--")) ?? 3);

if (!target) {
  console.error(
    "Usage: npm run seed:members -- <invite-code|league-id> [count] [--undo]",
  );
  process.exit(1);
}
if (!undo && (!Number.isInteger(count) || count < 1 || count > 19)) {
  console.error("Count must be a whole number between 1 and 19.");
  process.exit(1);
}

const pb = new PocketBase(url);
await pb
  .collection("_superusers")
  .authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

/** By invite code first, since that is what is on screen; then by id. */
async function findLeague(): Promise<LeagueRecord> {
  const code = target!.trim().toUpperCase();
  const byCode = await pb
    .collection("leagues")
    .getFullList<LeagueRecord>({
      filter: `invite_code = '${code}'`,
      requestKey: null,
    })
    .catch(() => []);
  if (byCode[0]) return byCode[0];

  const byId = await pb
    .collection("leagues")
    .getOne<LeagueRecord>(target!, { requestKey: null })
    .catch(() => null);
  if (byId) return byId;

  console.error(`No league with invite code or id ${JSON.stringify(target)}.`);
  process.exit(1);
}

const league = await findLeague();
const members = await pb
  .collection("league_members")
  .getFullList<MemberRecord & { expand?: { user?: { email?: string } } }>({
    filter: `league = '${league.id}'`,
    expand: "user",
    requestKey: null,
  });

if (undo) {
  // Memberships first: `picks.member` does not cascade, so a stand-in who has
  // already drafted cannot be removed until the draft is rolled back. Say so
  // rather than failing with a wall of PocketBase validation.
  let removed = 0;
  for (const member of members) {
    const email = member.expand?.user?.email ?? "";
    if (!email.endsWith(`@${SEED_DOMAIN}`)) continue;
    try {
      await pb
        .collection("league_members")
        .delete(member.id, { requestKey: null });
      await pb
        .collection("users")
        .delete(member.user, { requestKey: null })
        .catch(() => {});
      removed += 1;
    } catch {
      console.error(
        `Could not remove ${email}: they hold picks in a draft. Undo the draft first.`,
      );
    }
  }
  console.log(`Removed ${removed} stand-in member(s) from ${league.name}.`);
  process.exit(0);
}

const stamp = Date.now().toString(36);
let added = 0;

for (let i = 1; i <= count; i += 1) {
  const email = `seed-${stamp}-${i}@${SEED_DOMAIN}`;
  const name = `Seeded ${members.length + i}`;
  const user = await pb.collection("users").create(
    {
      email,
      password: SEED_PASSWORD,
      passwordConfirm: SEED_PASSWORD,
      name,
      // Verified, so nothing downstream treats them as half-registered.
      verified: true,
    },
    { requestKey: null },
  );

  await pb.collection("league_members").create(
    {
      league: league.id,
      user: user.id,
      team_name: `${name} FC`,
      autodraft_enabled: false,
    },
    { requestKey: null },
  );
  added += 1;
  console.log(`  + ${name} <${email}>`);
}

console.log(
  `\nAdded ${added} stand-in(s) to ${league.name}. ` +
    `${members.length + added} members total — roll the order and start the draft.\n` +
    `Sign in as one with the password ${JSON.stringify(SEED_PASSWORD)}, ` +
    `or remove them with: npm run seed:members -- ${target} --undo`,
);

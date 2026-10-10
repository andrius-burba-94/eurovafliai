/**
 * See what the model would be told about a round, and what it would write —
 * slice 7.0.
 *
 *   npm run ai:preview -- --league=<slug|id>                 # facts + a summary
 *   npm run ai:preview -- --league=<slug> --facts-only       # facts, no model call
 *   npm run ai:preview -- --league=<slug> --round=3 --voice=pundit
 *   npm run ai:preview -- --league=<slug> --model=gemini-3.8-flash
 *   npm run ai:preview -- --league=<slug> --save [--force]   # store it in ai_writeups
 *   npm run ai:preview -- --ping                             # which models the key may use
 *   npm run ai:preview -- --league=<slug> --scout [--facts-only]  # 7.2 G: the moves' reasons
 *
 * Nothing a member sees changes: no page reads `ai_writeups` until 7.1. The
 * fact sheet prints with tokens, exactly as the model reads it; the summary
 * prints twice, as stored (tokens) and as a reader would see it (names, put
 * back here, on this machine).
 *
 * Exit codes: 0 done, 1 the model or the guard failed, 2 refused (no such
 * league, or a round that is not finished).
 *
 * Plain Node, so it builds its own PocketBase client from `parseServerEnv`.
 */
import PocketBase from "pocketbase";

import { inputHash } from "../src/lib/ai/facts";
import { listModels } from "../src/lib/ai/gemini";
import { buildRoundFacts } from "../src/lib/ai/round-facts";
import { readRoundFactsInput } from "../src/lib/ai/round-facts-store";
import { claimWriteup, completeWriteup, failWriteup } from "../src/lib/ai/store";
import { writeRoundSummary } from "../src/lib/ai/summary";
import { buildScoutFacts } from "../src/lib/ai/scout-facts";
import { readScoutFactsInput } from "../src/lib/ai/scout-facts-store";
import { writeScoutReasons } from "../src/lib/ai/scout-reasons";
import { renderPlain } from "../src/lib/ai/tokens";
import { PROMPT_VERSION, VOICES, type Voice, writeupEntries } from "../src/lib/ai/voice";
import { parseServerEnv } from "../src/lib/config/schema";

const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];
const flag = (name: string) => process.argv.includes(`--${name}`);

function refuse(message: string, code = 2): never {
  console.error(message);
  process.exit(code);
}

const env = parseServerEnv(process.env);
const model = arg("model") ?? env.GEMINI_MODEL;
if (!/^[a-z0-9][a-z0-9.-]*$/.test(model)) refuse(`--model must be a plain model id, not ${model}`);
const voice = (arg("voice") ?? "analyst") as Voice;
if (!VOICES.includes(voice)) refuse(`--voice must be one of ${VOICES.join(", ")}`);
const apiKey = env.GEMINI_API_KEY;

if (flag("ping")) {
  if (!apiKey) refuse("GEMINI_API_KEY is not set.", 1);
  const models = await listModels({ apiKey });
  console.log(`The key may use ${models.length} models.`);
  console.log(`${model}: ${models.includes(model) ? "available" : "NOT available to this key"}`);
  process.exit(models.includes(model) ? 0 : 1);
}

const ref = arg("league");
if (!ref || !/^[a-z0-9-]{1,80}$/i.test(ref)) refuse("Pass --league=<slug or id>.");

if (flag("scout")) {
  const pbScout = new PocketBase(env.PB_INTERNAL_URL);
  await pbScout.collection("_superusers").authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);
  const found = await pbScout
    .collection("leagues")
    .getFirstListItem<{ id: string; name: string }>(pbScout.filter("slug = {:ref} || id = {:ref}", { ref }), { requestKey: null })
    .catch(() => null);
  if (!found) refuse(`No league answers to ${ref}.`);
  const input = await readScoutFactsInput(pbScout, { leagueId: found.id, season: env.EUROLEAGUE_SEASON });
  if (!input || input.members.length === 0) refuse("Nobody in this league has a move worth making right now.", 0);
  const sheet = buildScoutFacts(input);
  console.log(`PocketBase ${env.PB_INTERNAL_URL} · ${found.name} · ${input.ruleset} · ${sheet.moves.length} move(s) for ${input.members.length} member(s)`);
  console.log(`Fact sheet: ${sheet.text.length} characters, about ${Math.round(sheet.text.length / 4)} tokens`);
  console.log(`\n${sheet.text}\n`);
  if (flag("facts-only")) process.exit(0);
  if (!apiKey) refuse("GEMINI_API_KEY is not set; stopping after the facts.", 0);
  console.log(`Asking ${model} in the analyst voice…`);
  const written = await writeScoutReasons({ facts: sheet, model, apiKey });
  console.log(`${written.model} · ${written.calls} call(s) · tokens in ${written.usage.inputTokens}, out ${written.usage.outputTokens}`);
  const names = {
    members: {} as Record<string, string>,
    players: Object.fromEntries(input.members.flatMap((member) => member.moves.flatMap((entry) => [[entry.drop.id, entry.drop.name], [entry.add.id, entry.add.name]]))),
  };
  let refusedAny = false;
  for (const entry of sheet.moves) {
    const outcome = written.byMember[entry.memberId];
    console.log(`\n${entry.id} · member ${entry.memberId}`);
    if (!outcome || !outcome.ok) {
      refusedAny = true;
      for (const violation of outcome?.violations ?? ["no answer"]) console.log(`  ✗ ${violation}`);
      continue;
    }
    const text = outcome.reasons[`${entry.dropId}|${entry.addId}`]!;
    console.log(`  stored:  ${text}`);
    console.log(`  reads:   ${renderPlain([text], sheet.refs, names)[0]}`);
  }
  process.exit(refusedAny ? 1 : 0);
}
const roundArg = arg("round");
const round = roundArg === undefined ? undefined : Number(roundArg);
if (round !== undefined && (!Number.isInteger(round) || round < 1)) refuse("--round must be a round number.");

const pb = new PocketBase(env.PB_INTERNAL_URL);
await pb.collection("_superusers").authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

const league = await pb
  .collection("leagues")
  .getFirstListItem<{ id: string; name: string }>(pb.filter("slug = {:ref} || id = {:ref}", { ref }), { requestKey: null })
  .catch(() => null);
if (!league) refuse(`No league answers to ${ref}.`);

const read = await readRoundFactsInput(pb, {
  leagueId: league.id,
  season: env.EUROLEAGUE_SEASON,
  ...(round !== undefined ? { round } : {}),
  now: Date.now(),
});
if (!read.ok) refuse(`Refused: ${read.reason}.`);
const built = buildRoundFacts(read.input);
if (!built.ok) refuse(`Refused: ${built.reason}.`);
const facts = built.facts;
const hash = inputHash({ kind: "round_summary", text: facts.text, refs: facts.refs, voice, promptVersion: PROMPT_VERSION, model });

console.log(`PocketBase ${env.PB_INTERNAL_URL} · ${league.name} · round ${facts.round} · ${read.input.ruleset} scoring`);
console.log(`Fact sheet: ${facts.text.length} characters, about ${Math.round(facts.text.length / 4)} tokens · input ${hash.slice(0, 12)}`);
console.log(`\n${facts.text}\n`);

if (flag("facts-only")) process.exit(0);
if (!apiKey) refuse("GEMINI_API_KEY is not set; stopping after the facts.", 0);

const key = { leagueId: league.id, season: env.EUROLEAGUE_SEASON, round: facts.round, kind: "round_summary" as const, memberId: "" };
let claimed: string | null = null;
if (flag("save")) {
  const claim = await claimWriteup(pb, key, {
    inputHash: hash,
    voice,
    model,
    promptVersion: PROMPT_VERSION,
    facts: { version: facts.version, round: facts.round, text: facts.text },
    now: Date.now(),
    force: flag("force"),
  });
  if (claim.outcome !== "claimed") {
    console.log(`Not written: the stored write-up is ${claim.outcome} (${claim.id}). Pass --force to write it again.`);
    process.exit(0);
  }
  claimed = claim.id;
}

console.log(`Asking ${model} in the ${voice} voice…`);
let result: Awaited<ReturnType<typeof writeRoundSummary>>;
try {
  result = await writeRoundSummary({ facts, voice, model, apiKey });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (claimed) await failWriteup(pb, claimed, message);
  refuse(message, 1);
}

const { usage } = result;
console.log(
  `${result.model} · ${result.attempts} attempt(s) · ${result.latencyMs} ms · tokens in ${usage.inputTokens}, out ${usage.outputTokens}, thinking ${usage.thinkingTokens}`,
);
if (!result.ok) {
  console.log("\nRefused by the guard:");
  for (const violation of result.violations) console.log(`  ✗ ${violation}`);
  if (claimed) await failWriteup(pb, claimed, result.violations.join("; "), usage);
  process.exit(1);
}

const entries = writeupEntries(result.writeup!);
const width = Math.max(...entries.map((entry) => entry.label.length));
const labelled = (texts: readonly string[]) => texts.map((text, index) => `  ${entries[index]!.label.padEnd(width)}  ${text}`);
console.log("\nAs stored (tokens):");
for (const line of labelled(entries.map((entry) => entry.text))) console.log(line);
console.log("\nAs a member would read it:");
const names = { members: read.teamNames, players: read.playerNames };
for (const line of labelled(renderPlain(entries.map((entry) => entry.text), facts.refs, names))) console.log(line);
if (result.warnings.length > 0) {
  console.log("\nGuard warnings (not refusals yet):");
  for (const warning of result.warnings) console.log(`  ! ${warning}`);
}

if (claimed) {
  await completeWriteup(pb, claimed, { writeup: result.writeup!, refs: facts.refs, usage, model: result.model, now: Date.now() });
  console.log(`\nSaved to ai_writeups ${claimed}.`);
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CERTBOT_TAG = "# managed by Certbot";

type Part =
  | { kind: "text"; body: string }
  | { kind: "server"; body: string };

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error("unbalanced nginx braces");
}

function partitionVhost(source: string): Part[] {
  const parts: Part[] = [];
  let i = 0;
  const serverStart = /\bserver\s*\{/g;
  while (i < source.length) {
    serverStart.lastIndex = i;
    const match = serverStart.exec(source);
    if (!match) {
      parts.push({ kind: "text", body: source.slice(i) });
      break;
    }
    if (match.index > i) {
      parts.push({ kind: "text", body: source.slice(i, match.index) });
    }
    const openBrace = match.index + match[0].length - 1;
    const close = findMatchingBrace(source, openBrace);
    parts.push({ kind: "server", body: source.slice(match.index, close + 1) });
    i = close + 1;
  }
  return parts;
}

function hasLocation(server: string): boolean {
  return /^\s*location\s/m.test(server);
}

function isCertbotHttpStub(server: string): boolean {
  return !hasLocation(server) && /return\s+(404|301)\b/.test(server);
}

/**
 * Lines this comparison cannot meaningfully read.
 *
 * Three kinds, each for its own reason:
 *
 *  - **Certbot's own lines**, tagged. Certbot owns the TLS half of the live
 *    file and git deliberately does not carry it.
 *  - **`listen` directives.** The committed file is by design the *pre*-certbot
 *    one, because certbot needs a working `:80` vhost to answer the ACME
 *    challenge — and certbot then *replaces* that `listen 80;` with its own
 *    `listen 443 ssl;`. So git says `:80`, the box says `:443`, and neither is
 *    wrong. Comparing them is the one thing this file must not do. The cost,
 *    stated plainly: a deliberate port change in git is not caught here.
 *  - **Whole-line comments.** A comment is not configuration, and the live file
 *    is hand-installed, so a prose edit in git leaves the box's header stale
 *    for ever. That alone warned on every deploy. Trailing comments on a real
 *    directive are left alone — the directive is still compared.
 *
 * Every one of these was a live false positive: the box's `/pb/` block was
 * byte-correct and the deploy still cried wolf, which is exactly how a warning
 * stops being read.
 */
function dropIgnorableLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.includes(CERTBOT_TAG))
    .filter((line) => !/^\s*#/.test(line))
    .filter((line) => !/^\s*listen\s/.test(line))
    .join("\n");
}

export function canonicalizeVhost(source: string): string {
  const kept = partitionVhost(source)
    .filter((part) => part.kind === "text" || !isCertbotHttpStub(part.body))
    .map((part) => dropIgnorableLines(part.body))
    .join("");
  return normalizeVhost(kept);
}

function normalizeVhost(text: string): string {
  return `${text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "")}\n`;
}

export function vhostsEquivalent(live: string, committed: string): boolean {
  return canonicalizeVhost(live) === canonicalizeVhost(committed);
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === resolve(entry);
}

function main(): void {
  const livePath = process.argv[2];
  const committedPath = process.argv[3];
  if (!livePath || !committedPath) {
    process.stderr.write(
      "usage: nginx-vhost-canonical.ts <live-vhost> <committed-vhost>\n",
    );
    process.exit(2);
  }
  const live = readFileSync(livePath, "utf8");
  const committed = readFileSync(committedPath, "utf8");
  process.exit(vhostsEquivalent(live, committed) ? 0 : 1);
}

if (isMain()) {
  main();
}

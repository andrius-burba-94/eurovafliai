/**
 * Print the PocketBase schema as stable, secret-free JSON on stdout.
 *
 * Exists so CI can assert that rolling every migration back and re-applying it
 * reproduces the same schema — `migrate down N` is otherwise a path only ever
 * exercised by hand, on the day it is needed most. Diff two dumps:
 *
 *   node --env-file=.env scripts/pb-dump-schema.mjs > before.json
 *   # ... migrate down N, boot again so they re-apply ...
 *   node --env-file=.env scripts/pb-dump-schema.mjs > after.json
 *   diff -u before.json after.json
 *
 * "Stable" is the whole job. Two things in a PocketBase schema change on every
 * re-application even when the schema is identical, and both are normalised out:
 *
 *   - **Generated ids.** Our migrations build collections with `new Collection()`
 *     and never pin an id, so collection and field ids are fresh each time. Ids
 *     are dropped, and a relation field's `collectionId` is replaced by the
 *     target collection's *name*, which is what we actually care about.
 *   - **Index names.** PocketBase names an index with a random suffix; the
 *     interesting part is `UNIQUE`, the table and the columns. Names are stripped
 *     and the remainder kept verbatim.
 *
 * Secrets never reach stdout: an OAuth2 provider's clientId and clientSecret are
 * replaced with a short hash, so a dump proves "the same credential is still
 * configured" without printing it into a CI log.
 */
import { createHash } from "node:crypto";

import PocketBase from "pocketbase";

import { parseServerEnv } from "../src/lib/config/schema.ts";

const env = parseServerEnv(process.env);

const fingerprint = (value) =>
  value
    ? `sha256:${createHash("sha256").update(String(value)).digest("hex").slice(0, 12)}`
    : null;

const pb = new PocketBase(env.PB_INTERNAL_URL);
await pb
  .collection("_superusers")
  .authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

const collections = await pb.collections.getFullList({ requestKey: null });
const nameById = new Map(collections.map((c) => [c.id, c.name]));

const byName = (a, b) => a.name.localeCompare(b.name);

const normaliseField = (field) => {
  const { id: _id, ...rest } = field;
  if (rest.collectionId) {
    // A relation's target is meaningful; its generated id is not.
    rest.collectionRef = nameById.get(rest.collectionId) ?? "(unknown)";
    delete rest.collectionId;
  }
  return Object.fromEntries(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)));
};

const normaliseIndex = (index) =>
  // CREATE UNIQUE INDEX `idx_9fJk…` ON `leagues` (`invite_code`)
  index.replace(/INDEX\s+`?[^`\s]+`?\s+ON/i, "INDEX ON");

const normaliseOAuth2 = (oauth2) => {
  if (!oauth2) return oauth2;
  return {
    enabled: oauth2.enabled,
    providers: [...(oauth2.providers ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        name: p.name,
        clientId: fingerprint(p.clientId),
        clientSecret: fingerprint(p.clientSecret),
        authURL: p.authURL || null,
        tokenURL: p.tokenURL || null,
        userInfoURL: p.userInfoURL || null,
        pkce: p.pkce ?? null,
      })),
  };
};

const dump = collections
  .filter((c) => !c.system || c.name === "users")
  .sort(byName)
  .map((c) => ({
    name: c.name,
    type: c.type,
    listRule: c.listRule,
    viewRule: c.viewRule,
    createRule: c.createRule,
    updateRule: c.updateRule,
    deleteRule: c.deleteRule,
    authRule: c.authRule ?? null,
    manageRule: c.manageRule ?? null,
    passwordAuth: c.passwordAuth
      ? {
          enabled: c.passwordAuth.enabled,
          identityFields: [...(c.passwordAuth.identityFields ?? [])].sort(),
        }
      : null,
    oauth2: normaliseOAuth2(c.oauth2),
    fields: [...c.fields].sort(byName).map(normaliseField),
    indexes: [...(c.indexes ?? [])].map(normaliseIndex).sort(),
  }));

console.log(JSON.stringify(dump, null, 2));

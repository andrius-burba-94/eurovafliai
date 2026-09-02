import type PocketBase from "pocketbase";

/**
 * A PocketBase stand-in for unit tests — the first fake in this repo, and
 * built to be strict rather than convenient.
 *
 * The worker's sweep is I/O from end to end: read the live drafts, read their
 * picks, write a pick, write the advance. That is exactly the code a real
 * database exercises well and a mock exercises badly, so two things are
 * deliberate here:
 *
 * - **The unique indexes are enforced.** `picks` carries the same two
 *   composite indexes as `pb/pb_migrations/1788267300_created_picks.js`, and a
 *   violation throws the error shape PocketBase 0.39 actually returns
 *   (`response.data.<field>.code === "validation_not_unique"`). Without that,
 *   a test could "prove" a race is handled while the real backstop is missing.
 * - **An unsupported query throws.** A fake that quietly ignored part of a
 *   query would return the wrong rows and make broken code pass — and that
 *   applies to every option, not just `filter`. An unparseable filter, a
 *   multi-field sort, a sort on a field the fixtures do not carry, or an option
 *   this file has never heard of (`expand`, `fields`, `page`) all throw, so the
 *   failure is a message rather than a mystery. Extending this file is the
 *   intended response.
 *
 * It is not a PocketBase emulator, and the integration proof lives in
 * `tests/e2e/worker.spec.ts`, which drives the sweep against the real thing.
 */

export type FakeRecord = Record<string, unknown> & { id: string };
export type FakeDb = Record<string, FakeRecord[]>;

/** Mirrors the composite indexes in the `picks` migration. */
const DEFAULT_UNIQUE: Record<string, string[][]> = {
  picks: [
    ["draft", "overall_no"],
    ["draft", "player"],
  ],
};

export type FakeHooks = {
  /**
   * Runs before a create lands — the seam for staging a race. Throw from it to
   * simulate a failure, or write into `db` to simulate somebody else getting
   * there between the sweep's read and its write.
   */
  beforeCreate?(collection: string, data: Record<string, unknown>): void;
  /** The same seam on the read side: throw to fail one collection's query. */
  beforeList?(collection: string, filter: string): void;
};

export type FakePb = {
  /** Cast to the real client type. The sweep only ever calls what is implemented here. */
  client: PocketBase;
  db: FakeDb;
  /** Every write, in order: `create picks`, `update drafts:abc`. */
  writes: string[];
  rows(collection: string): FakeRecord[];
};

export function fakePb(options: {
  data: FakeDb;
  uniqueIndexes?: Record<string, string[][]>;
  hooks?: FakeHooks;
}): FakePb {
  const db: FakeDb = {};
  for (const [name, rows] of Object.entries(options.data)) {
    db[name] = rows.map((row) => ({ ...row }));
  }
  const unique = options.uniqueIndexes ?? DEFAULT_UNIQUE;
  const hooks = options.hooks ?? {};
  const writes: string[] = [];
  let sequence = 0;

  function rows(collection: string): FakeRecord[] {
    db[collection] ??= [];
    return db[collection];
  }

  function service(collection: string) {
    return {
      async getFullList<T>(options?: {
        filter?: string;
        sort?: string;
      }): Promise<T[]> {
        onlySupported(options, ["filter", "sort"]);
        hooks.beforeList?.(collection, options?.filter ?? "");
        const found = rows(collection).filter((record) =>
          matches(record, options?.filter),
        );
        return sorted(found, options?.sort).map((record) => ({
          ...record,
        })) as T[];
      },

      async getOne<T>(id: string, options?: object): Promise<T> {
        onlySupported(options, []);
        const found = rows(collection).find((record) => record.id === id);
        if (!found) throw notFound(collection, id);
        return { ...found } as T;
      },

      async create<T>(
        body: Record<string, unknown>,
        options?: object,
      ): Promise<T> {
        onlySupported(options, []);
        hooks.beforeCreate?.(collection, body);
        for (const fields of unique[collection] ?? []) {
          const clash = rows(collection).some((record) =>
            fields.every((field) => record[field] === body[field]),
          );
          if (clash) throw notUnique(fields);
        }
        sequence += 1;
        const record: FakeRecord = {
          id: `${collection}_${sequence}`,
          created: stamp(sequence),
          ...body,
        };
        rows(collection).push(record);
        writes.push(`create ${collection}`);
        return { ...record } as T;
      },

      async update<T>(
        id: string,
        body: Record<string, unknown>,
        options?: object,
      ): Promise<T> {
        onlySupported(options, []);
        const found = rows(collection).find((record) => record.id === id);
        if (!found) throw notFound(collection, id);
        Object.assign(found, body);
        writes.push(`update ${collection}:${id}`);
        return { ...found } as T;
      },

      async delete(id: string, options?: object): Promise<boolean> {
        onlySupported(options, []);
        const list = rows(collection);
        const at = list.findIndex((record) => record.id === id);
        if (at === -1) throw notFound(collection, id);
        list.splice(at, 1);
        writes.push(`delete ${collection}:${id}`);
        return true;
      },
    };
  }

  const client = { collection: service } as unknown as PocketBase;
  return { client, db, writes, rows };
}

/**
 * The subset of PocketBase's filter syntax this repo's draft code actually
 * writes. Mixed `&&`/`||` throws rather than guessing at precedence.
 */
function matches(record: FakeRecord, filter?: string): boolean {
  const text = filter?.trim();
  if (!text) return true;
  if (text.includes("&&") && text.includes("||")) {
    throw new Error(`fake-pb will not guess precedence in: ${text}`);
  }
  if (text.includes("||")) {
    return text.split("||").some((part) => matches(record, part));
  }
  if (text.includes("&&")) {
    return text.split("&&").every((part) => matches(record, part));
  }
  const parsed = /^(\w+)\s*(!=|=)\s*'([^']*)'$/.exec(text);
  if (!parsed) throw new Error(`fake-pb cannot parse filter: ${text}`);
  const [, field, operator, value] = parsed;
  // PocketBase compares an unset field as empty, not as undefined.
  const actual =
    record[field] === undefined || record[field] === null
      ? ""
      : String(record[field]);
  return operator === "=" ? actual === value : actual !== value;
}

/**
 * Everything this fake understands, per call. `requestKey` is always allowed —
 * every read in this repo passes it — and anything else named here is
 * implemented below. An option that is neither is a silent lie waiting to
 * happen: `expand` ignored returns rows without their relations, and the test
 * asserts against nulls it thinks are real.
 */
function onlySupported(options: object | undefined, supported: string[]): void {
  for (const key of Object.keys(options ?? {})) {
    if (key === "requestKey" || supported.includes(key)) continue;
    throw new Error(
      `fake-pb does not implement the "${key}" option — implement it rather than ignoring it`,
    );
  }
}

function sorted(records: FakeRecord[], sort?: string): FakeRecord[] {
  if (!sort) return records;
  if (sort.includes(",")) {
    throw new Error(`fake-pb sorts by one field, not "${sort}"`);
  }
  const descending = sort.startsWith("-");
  const field = descending ? sort.slice(1) : sort;
  // A field the rows do not carry compares `undefined` against `undefined` for
  // every pair, which scrambles the order instead of failing. `readPicks`
  // depends on `sort: "overall_no"` being honoured for `findUnadvancedPick` and
  // `whoIsOnClock` to be right, so a typo here has to be loud.
  const missing = records.find((record) => record[field] === undefined);
  if (missing) {
    throw new Error(
      `fake-pb cannot sort by "${field}": record ${missing.id} does not have it`,
    );
  }
  return [...records].sort((a, b) => {
    const left = a[field] as string | number;
    const right = b[field] as string | number;
    const order = left === right ? 0 : left < right ? -1 : 1;
    return descending ? -order : order;
  });
}

/** The shape `isUniqueViolation` reads, as PocketBase 0.39 sends it. */
function notUnique(fields: string[]): unknown {
  return {
    status: 400,
    response: {
      data: Object.fromEntries(
        fields.map((field) => [
          field,
          { code: "validation_not_unique", message: "Value must be unique." },
        ]),
      ),
    },
  };
}

function notFound(collection: string, id: string): Error {
  const error = new Error(`fake-pb: no ${collection} record ${id}`);
  Object.assign(error, { status: 404 });
  return error;
}

/** Monotonic, so `sort: "-created"` orders by insertion. */
function stamp(sequence: number): string {
  return new Date(Date.UTC(2026, 8, 2, 12, 0, sequence))
    .toISOString()
    .replace("T", " ");
}

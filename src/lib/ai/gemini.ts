import { sleep } from "@/lib/euroleague/http";

/**
 * The one door to Gemini — slice 7.0.
 *
 * The Interactions API with `store: false`: Google keeps every interaction
 * (a day on the free tier, 55 on paid) unless told not to, and nothing here
 * ever continues a conversation, so there is nothing worth keeping on their
 * side. `generateContent` would also work; the choice lives in
 * `buildRequestBody` and `readAnswer` alone. Shapes are the ones probed live on
 * 2026-10-09 — see docs/research/gemini-api.md.
 *
 * Framework-free and `doFetch`-injectable like the other external clients,
 * with its own retry because each failure needs a different sentence: a
 * refused key is the one a person has to fix, a quota is one to wait out.
 * The key travels in a header only — never the URL — and every message is
 * scrubbed of it before it can reach a log.
 */

export const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";

export type ThinkingLevel = "low" | "medium" | "high";

export type GeminiRequest = {
  readonly model: string;
  readonly system: string;
  readonly prompt: string;
  /** A JSON Schema in Gemini's subset. It has no `maxLength`: lengths are the caller's zod. */
  readonly schema: Readonly<Record<string, unknown>>;
  readonly thinkingLevel?: ThinkingLevel;
  readonly maxOutputTokens?: number;
};

export type GeminiUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly thinkingTokens: number;
};

export type GeminiAnswer = {
  /** Parsed JSON, unvalidated: the caller owns the shape. */
  readonly value: unknown;
  readonly text: string;
  readonly usage: GeminiUsage;
  readonly model: string;
  readonly latencyMs: number;
};

export type GeminiOptions = {
  readonly apiKey: string;
  readonly doFetch?: typeof fetch;
  readonly wait?: (ms: number) => Promise<void>;
  readonly timeoutMs?: number;
};

export class GeminiKeyRefused extends Error {
  constructor() {
    super("Gemini refused the API key. Create a new one at aistudio.google.com/apikey.");
    this.name = "GeminiKeyRefused";
  }
}

export class GeminiQuota extends Error {
  constructor(detail: string) {
    super(`Gemini's quota is used up for now (${detail}).`);
    this.name = "GeminiQuota";
  }
}

export class GeminiUnavailable extends Error {
  constructor(detail: string) {
    super(`Gemini did not answer (${detail}).`);
    this.name = "GeminiUnavailable";
  }
}

/** A request Gemini will never accept as sent — our bug, so it is not retried. */
export class GeminiRequestRefused extends Error {
  constructor(status: number, detail: string) {
    super(`Gemini refused the request (${status}: ${detail}).`);
    this.name = "GeminiRequestRefused";
  }
}

/** Gemini answered, but not with a complete JSON value. */
export class GeminiNoAnswer extends Error {
  constructor(detail: string) {
    super(`Gemini gave no usable answer (${detail}).`);
    this.name = "GeminiNoAnswer";
  }
}

const ATTEMPTS = 3;
const TIMEOUT_MS = 60_000;
const RETRY_STATUS = new Set([500, 502, 503, 504]);
/** A quota that asks for longer than this is a daily cap, not a burst: stop asking. */
const LONGEST_WAIT_MS = 30_000;
const DETAIL_LIMIT = 300;

export function buildRequestBody(request: GeminiRequest): Record<string, unknown> {
  return {
    model: request.model,
    store: false,
    system_instruction: request.system,
    input: request.prompt,
    // No temperature: Google advises Gemini 3 stays at its default of 1.0.
    generation_config: {
      thinking_level: request.thinkingLevel ?? "low",
      max_output_tokens: request.maxOutputTokens ?? 4096,
    },
    response_format: { type: "text", mime_type: "application/json", schema: request.schema },
  };
}

export async function generateJson(request: GeminiRequest, options: GeminiOptions): Promise<GeminiAnswer> {
  const doFetch = options.doFetch ?? fetch;
  const wait = options.wait ?? sleep;
  const started = Date.now();
  const body = JSON.stringify(buildRequestBody(request));

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const last = attempt === ATTEMPTS;
    let response: Response;
    try {
      response = await doFetch(`${GEMINI_API}/interactions`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
        body,
        signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      });
    } catch (error) {
      if (last) throw new GeminiUnavailable(scrub(describe(error), options.apiKey));
      await wait(2_000 * attempt);
      continue;
    }

    if (response.ok) {
      return { ...readAnswer(await response.json()), latencyMs: Date.now() - started };
    }

    const failure = readFailure(await response.text(), options.apiKey);
    if (response.status === 401 || failure.reason === "API_KEY_INVALID") throw new GeminiKeyRefused();
    if (response.status === 429) {
      const delay = failure.retryDelayMs ?? 2_000 * attempt;
      if (last || delay > LONGEST_WAIT_MS) throw new GeminiQuota(failure.message);
      await wait(delay);
      continue;
    }
    if (!RETRY_STATUS.has(response.status)) {
      throw new GeminiRequestRefused(response.status, failure.message);
    }
    if (last) throw new GeminiUnavailable(`${response.status}: ${failure.message}`);
    await wait(2_000 * attempt);
  }
  throw new Error("unreachable");
}

/** The model ids this key may use. Costs no generation quota, so it is the ping. */
export async function listModels(options: GeminiOptions): Promise<string[]> {
  const doFetch = options.doFetch ?? fetch;
  const response = await doFetch(`${GEMINI_API}/models?pageSize=200`, {
    headers: { "x-goog-api-key": options.apiKey },
    signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
  });
  if (!response.ok) {
    const failure = readFailure(await response.text(), options.apiKey);
    if (response.status === 401 || failure.reason === "API_KEY_INVALID") throw new GeminiKeyRefused();
    throw new GeminiRequestRefused(response.status, failure.message);
  }
  const body = (await response.json()) as { models?: { name?: unknown }[] };
  return (body.models ?? [])
    .map((model) => (typeof model.name === "string" ? model.name.replace(/^models\//, "") : ""))
    .filter((name) => name !== "");
}

type Step = { type?: unknown; content?: { type?: unknown; text?: unknown }[] };
type InteractionBody = {
  status?: unknown;
  model?: unknown;
  steps?: Step[];
  usage?: Record<string, unknown>;
};

/** Reads one finished interaction. Thought steps are skipped: only `model_output` is the answer. */
export function readAnswer(raw: unknown): Omit<GeminiAnswer, "latencyMs"> {
  const body = (raw ?? {}) as InteractionBody;
  // `incomplete` is what a cut-off answer reports (probed with a 12-token cap).
  if (body.status !== "completed") throw new GeminiNoAnswer(`status ${String(body.status)}`);

  const text = (body.steps ?? [])
    .filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .map((part) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
    .join("");
  if (text.trim() === "") throw new GeminiNoAnswer("empty output");

  const usage = body.usage ?? {};
  return {
    value: parseJsonValue(text),
    text,
    usage: {
      inputTokens: count(usage.total_input_tokens),
      outputTokens: count(usage.total_output_tokens),
      thinkingTokens: count(usage.total_thought_tokens),
    },
    model: typeof body.model === "string" ? body.model : "",
  };
}

/**
 * JSON out of a reply that is meant to be pure JSON and sometimes is not: the
 * lite model was seen opening with a sentence and a code fence even with a
 * schema set. The outermost object is the answer; anything else is no answer.
 */
function parseJsonValue(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next reading
    }
  }
  throw new GeminiNoAnswer("the reply was not JSON");
}

type Failure = { message: string; reason: string | null; retryDelayMs: number | null };

/**
 * Google's error, wherever it sits. The Interactions endpoint wraps it in an
 * array (`[{error}]`); the older endpoints do not.
 */
function readFailure(text: string, apiKey: string): Failure {
  let error: { message?: unknown; details?: { reason?: unknown; retryDelay?: unknown }[] } | undefined;
  try {
    const parsed = JSON.parse(text) as unknown;
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    error = (first as { error?: typeof error } | null)?.error;
  } catch {
    error = undefined;
  }
  const details = Array.isArray(error?.details) ? error.details : [];
  const reason = details.map((detail) => detail.reason).find((value) => typeof value === "string");
  const delay = details.map((detail) => detail.retryDelay).find((value) => typeof value === "string");
  const message = typeof error?.message === "string" ? error.message : text.slice(0, DETAIL_LIMIT);
  return {
    message: scrub(message, apiKey).slice(0, DETAIL_LIMIT) || "no detail",
    reason: typeof reason === "string" ? reason : null,
    retryDelayMs: typeof delay === "string" ? secondsToMs(delay) : null,
  };
}

/** `"30s"` or `"1.5s"`, Google's duration form. */
function secondsToMs(duration: string): number | null {
  const match = /^(\d+(?:\.\d+)?)s$/.exec(duration);
  return match ? Math.ceil(Number(match[1]) * 1000) : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function scrub(text: string, apiKey: string): string {
  return apiKey === "" ? text : text.split(apiKey).join("[key]");
}

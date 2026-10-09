import { describe, expect, it } from "vitest";

import keyInvalid from "./fixtures/error-api-key-invalid.json";
import completed from "./fixtures/interaction-completed.json";
import incomplete from "./fixtures/interaction-incomplete.json";
import {
  buildRequestBody,
  GEMINI_API,
  GeminiKeyRefused,
  GeminiNoAnswer,
  GeminiQuota,
  GeminiRequestRefused,
  GeminiUnavailable,
  generateJson,
  listModels,
  readAnswer,
  type GeminiRequest,
} from "./gemini";

const KEY = "AQ.test-key-value";

const request: GeminiRequest = {
  model: "gemini-3.5-flash-lite",
  system: "Write two lines.",
  prompt: "Facts: @T1 won.",
  schema: { type: "object", properties: { lines: { type: "array", items: { type: "string" } } } },
};

type Reply = { status: number; body: unknown } | Error;

function serving(...replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const waits: number[] = [];
  const doFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)]!;
    if (reply instanceof Error) throw reply;
    const text = typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body);
    return new Response(text, { status: reply.status });
  }) as typeof fetch;
  const wait = async (ms: number) => {
    waits.push(ms);
  };
  return { doFetch, wait, calls, waits };
}

function quota(retryDelay: string) {
  return [
    {
      error: {
        code: 429,
        message: "Resource has been exhausted (e.g. check quota).",
        status: "RESOURCE_EXHAUSTED",
        details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay }],
      },
    },
  ];
}

describe("buildRequestBody", () => {
  it("asks for stateless JSON with low thinking and no temperature", () => {
    expect(buildRequestBody(request)).toEqual({
      model: "gemini-3.5-flash-lite",
      store: false,
      system_instruction: "Write two lines.",
      input: "Facts: @T1 won.",
      generation_config: { thinking_level: "low", max_output_tokens: 4096 },
      response_format: { type: "text", mime_type: "application/json", schema: request.schema },
    });
  });
});

describe("generateJson", () => {
  it("posts to the interactions endpoint with the key in a header, never the URL", async () => {
    const { doFetch, wait, calls } = serving({ status: 200, body: completed });
    await generateJson(request, { apiKey: KEY, doFetch, wait });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${GEMINI_API}/interactions`);
    expect(calls[0]!.url).not.toContain(KEY);
    expect(new Headers(calls[0]!.init.headers).get("x-goog-api-key")).toBe(KEY);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual(buildRequestBody(request));
  });

  it("reads the model output, skipping thought steps, with usage", async () => {
    const { doFetch, wait } = serving({ status: 200, body: completed });
    const answer = await generateJson(request, { apiKey: KEY, doFetch, wait });

    expect(answer.value).toEqual({
      lines: ["@T1 won round 4 with 214.6 fantasy points.", "@T2 finished second with 206.5 points."],
    });
    expect(answer.usage).toEqual({ inputTokens: 49, outputTokens: 48, thinkingTokens: 0 });
    expect(answer.model).toBe("gemini-3.5-flash-lite");
  });

  it("says the key was refused on Google's 400, without retrying", async () => {
    const { doFetch, wait, calls } = serving({ status: 400, body: keyInvalid });
    await expect(generateJson(request, { apiKey: KEY, doFetch, wait })).rejects.toBeInstanceOf(GeminiKeyRefused);
    expect(calls).toHaveLength(1);
  });

  it("waits out a short quota delay and succeeds", async () => {
    const { doFetch, wait, calls, waits } = serving({ status: 429, body: quota("7s") }, { status: 200, body: completed });
    await expect(generateJson(request, { apiKey: KEY, doFetch, wait })).resolves.toMatchObject({
      model: "gemini-3.5-flash-lite",
    });
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([7000]);
  });

  it("does not wait out a long quota delay", async () => {
    const { doFetch, wait, calls, waits } = serving({ status: 429, body: quota("60s") });
    await expect(generateJson(request, { apiKey: KEY, doFetch, wait })).rejects.toBeInstanceOf(GeminiQuota);
    expect(calls).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it("retries a server error and then reports Gemini unavailable", async () => {
    const { doFetch, wait, calls } = serving({ status: 503, body: [{ error: { message: "overloaded" } }] });
    await expect(generateJson(request, { apiKey: KEY, doFetch, wait })).rejects.toThrow(GeminiUnavailable);
    expect(calls).toHaveLength(3);
  });

  it("retries a network failure", async () => {
    const { doFetch, wait, calls } = serving(new TypeError("fetch failed"), { status: 200, body: completed });
    await expect(generateJson(request, { apiKey: KEY, doFetch, wait })).resolves.toBeDefined();
    expect(calls).toHaveLength(2);
  });

  it("refuses any other 4xx at once, as our own bug", async () => {
    const { doFetch, wait, calls } = serving({
      status: 400,
      body: [{ error: { message: "Unknown name \"temperature\"", status: "INVALID_ARGUMENT" } }],
    });
    await expect(generateJson(request, { apiKey: KEY, doFetch, wait })).rejects.toThrow(GeminiRequestRefused);
    expect(calls).toHaveLength(1);
  });

  it("never repeats the key in an error, even when Google echoes it", async () => {
    const { doFetch, wait } = serving({ status: 400, body: [{ error: { message: `bad header ${KEY}` } }] });
    const error = await generateJson(request, { apiKey: KEY, doFetch, wait }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GeminiRequestRefused);
    expect((error as Error).message).not.toContain(KEY);
  });
});

describe("readAnswer", () => {
  it("treats a cut-off answer as no answer", () => {
    expect(() => readAnswer(incomplete)).toThrow(GeminiNoAnswer);
  });

  it("finds the object inside a reply that wraps it in prose and a fence", () => {
    const body = {
      ...completed,
      steps: [{ type: "model_output", content: [{ type: "text", text: 'Here it is:\n```json\n{"lines":["a"]}\n```' }] }],
    };
    expect(readAnswer(body).value).toEqual({ lines: ["a"] });
  });

  it("refuses a reply with no JSON in it", () => {
    const body = { ...completed, steps: [{ type: "model_output", content: [{ type: "text", text: "Sorry." }] }] };
    expect(() => readAnswer(body)).toThrow(/not JSON/);
  });

  it("refuses an empty reply", () => {
    expect(() => readAnswer({ ...completed, steps: [{ type: "thought" }] })).toThrow(/empty output/);
  });
});

describe("listModels", () => {
  it("strips the models/ prefix", async () => {
    const { doFetch } = serving({
      status: 200,
      body: { models: [{ name: "models/gemini-3.8-flash" }, { name: "models/gemini-3.5-flash-lite" }] },
    });
    await expect(listModels({ apiKey: KEY, doFetch })).resolves.toEqual(["gemini-3.8-flash", "gemini-3.5-flash-lite"]);
  });

  it("says the key was refused", async () => {
    const { doFetch } = serving({ status: 400, body: keyInvalid });
    await expect(listModels({ apiKey: KEY, doFetch })).rejects.toBeInstanceOf(GeminiKeyRefused);
  });
});

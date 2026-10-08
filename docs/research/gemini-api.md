# Gemini API

Checked against the real service on **9 October 2026** with the project's key
(an AI Studio key on the maintainer's personal Google account), and against
Google's documentation the same day. Model names and tiers move often:
re-check this page before relying on a figure in it.

## Models

- `GET /v1beta/models` with the key lists what it may use. On 9 October it
  answered 62 models, including `gemini-3.8-flash`, `gemini-3.7-flash`,
  `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`,
  `gemini-3.1-flash-lite` and the 2.5 family. The listing costs no
  generation quota, so it is `ai:preview --ping`.
- Google's model page recommends **`gemini-3.8-flash`** (or
  `gemini-3.5-flash-lite` where cost matters) for new projects. The 2.5 models
  are not deprecated but have **limited access**: kept for users who already
  used them. The blueprint's original "Gemini 2.5 Flash" is why the model is
  now `GEMINI_MODEL` rather than a constant.
- Free-tier limits are per model. A dev machine sets
  `GEMINI_MODEL=gemini-3.5-flash-lite` so local runs leave production's model
  alone.

## Endpoint

The **Interactions API**, stateless:

```
POST https://generativelanguage.googleapis.com/v1beta/interactions
x-goog-api-key: <key>
{
  "model": "gemini-3.5-flash-lite",
  "store": false,
  "system_instruction": "…",
  "input": "…",
  "generation_config": { "thinking_level": "low", "max_output_tokens": 4096 },
  "response_format": { "type": "text", "mime_type": "application/json", "schema": { … } }
}
```

- Google recommends Interactions for new projects and calls `generateContent`
  "legacy", though fully supported. Both work; the choice lives in
  `buildRequestBody` and `readAnswer` in `src/lib/ai/gemini.ts`.
- **`store: false` is mandatory here.** By default every interaction is
  stored server-side (1 day on the free tier, 55 on paid). Nothing in this app
  continues a conversation, so nothing should be kept. With `store: false` the
  response carries no interaction id.
- The key goes in the `x-goog-api-key` header, never in the URL.
- No `temperature`: Google strongly advises Gemini 3 models stay at the
  default 1.0.
- `thinking_level` on 3.8 Flash is `low` / `medium` (default) / `high`; it
  cannot be switched off. Thought tokens are billed as output. With `low`, the
  probes reported 0 thought tokens.
- The schema is a subset of JSON Schema: `type`, `properties`, `required`,
  `additionalProperties`, `enum`, `items`, `minItems`/`maxItems`,
  `minimum`/`maximum`. **No `maxLength`**: string lengths are checked in zod.

## Response

```
{
  "status": "completed",            // "incomplete" when max_output_tokens cut it off
  "model": "gemini-3.5-flash-lite",
  "usage": { "total_input_tokens": 49, "total_output_tokens": 48, "total_thought_tokens": 0, … },
  "steps": [
    { "type": "thought", "signature": "…" },
    { "type": "model_output", "content": [{ "type": "text", "text": "{\"lines\": [...]}" }] }
  ]
}
```

- The answer is the `text` of the `model_output` steps; thought steps carry
  only an opaque signature and are skipped.
- **A schema does not guarantee pure JSON.** With a 12-token cap the lite
  model opened with "Here is the JSON requested:" and a code fence. The client
  takes the outermost `{…}` and refuses anything else, and only trusts a
  `completed` status.
- Captured responses: `src/lib/ai/fixtures/`.

## Errors

- A bad key answers **400** `INVALID_ARGUMENT` with
  `details[].reason = "API_KEY_INVALID"`. On this endpoint the error body is
  **wrapped in an array**: `[{"error": {…}}]`. The client reads both shapes.
- A quota answers 429 `RESOURCE_EXHAUSTED`, with a `RetryInfo.retryDelay`
  such as `"7s"` (from the documentation; not provoked). The client waits out
  up to 30 s and otherwise reports the quota.

## Plans, tiers and data

- **A consumer Google AI plan does not cover the API.** Google: plan
  benefits "apply only within the Google AI Studio web interface"; API keys
  are "billed and managed separately". A key on a Google AI Plus account runs
  on the **free tier** unless billing is enabled on its Cloud project.
- On the free tier Google may use prompts and answers to improve its
  products, and human reviewers may read them, **except** that "if you're in
  the European Economic Area, Switzerland, or the United Kingdom, the terms
  under 'How Google uses Your Data' in 'Paid Services' apply to all
  Services". The league is in Lithuania.
- The app sends no names anyway (ADR-0012), so the tier changes nothing about
  what leaves the box.
- Paid prices for `gemini-3.8-flash`: $0.75 per 1M input and $3.75 per 1M
  output tokens until 31 December 2026, then $1.50 and $7.50.
  `gemini-3.5-flash-lite`: $0.30 and $2.50.

## Measured on the local league (round 3, 8 teams)

| Model | Voice | Tokens in / out / thinking | Latency | Guard |
|---|---|---|---|---|
| gemini-3.5-flash-lite | analyst | 4,594 / 120 / 0 | 1.4 s | passed first time |
| gemini-3.5-flash-lite | pundit | 4,616 / 124 / 0 | 1.6 s | passed first time |
| gemini-3.8-flash | pundit | 4,616 / 141 / 0 | 2.6 s | passed first time |

The fact sheet was 9,543 characters. 3.8 Flash named a second carrying player
and an overperformer where the lite model kept to the winner and the table;
both kept to the facts.

Sources: [models](https://ai.google.dev/gemini-api/docs/models),
[deprecations](https://ai.google.dev/gemini-api/docs/deprecations),
[Interactions](https://ai.google.dev/gemini-api/docs/interactions),
[structured output](https://ai.google.dev/gemini-api/docs/structured-output),
[thinking](https://ai.google.dev/gemini-api/docs/thinking),
[pricing](https://ai.google.dev/gemini-api/docs/pricing),
[Google AI plans](https://ai.google.dev/gemini-api/docs/google-ai-plans),
[terms](https://ai.google.dev/gemini-api/terms).

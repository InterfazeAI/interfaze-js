# interfaze

The official [Interfaze](https://interfaze.ai) SDK for TypeScript / JavaScript — a thin,
typed wrapper over the OpenAI SDK. If you know the OpenAI SDK, you already know this one:
same `chat.completions` surface, plus typed access to everything Interfaze adds
(`precontext`, `reasoning`, `vcache`, `<task>`/`<guard>` helpers) and none of the sharp edges.

Universal: Node 18+, browsers, and edge/workers. ESM + CommonJS.

## Install

```bash
npm install interfaze
```

```bash
export INTERFAZE_API_KEY="sk_..."
```

## Quickstart

```ts
import { Interfaze } from "interfaze";        // or: import Interfaze from "interfaze"

const interfaze = new Interfaze(); // reads INTERFAZE_API_KEY

const res = await interfaze.chat.completions.create({
  messages: [{ role: "user", content: "Write a haiku about deterministic AI." }],
});
console.log(res.choices[0].message.content);
```

CommonJS: `const { Interfaze } = require("interfaze");`

`model` defaults to `interfaze-beta`; you can omit it.

## Task helpers

High-level helpers for Interfaze's built-in tasks. Each returns the task's raw `result`:

```ts
await interfaze.tasks.ocr("https://example.com/receipt.jpg");
await interfaze.tasks.webSearch("latest AI agent news");
await interfaze.tasks.transcribe("https://example.com/audio.wav");
await interfaze.tasks.scrape("https://example.com/product");
await interfaze.tasks.translate("Hello", { to: "French" });
await interfaze.tasks.objectDetection("https://example.com/photo.jpg");
await interfaze.tasks.guiDetection("https://example.com/screenshot.png");
await interfaze.tasks.forecast("https://example.com/timeseries.csv", { periods: 30 });
```

Or force a task on a raw completion:

```ts
import { inputs } from "interfaze";

const res = await interfaze.chat.completions.create({
  task: "ocr",
  messages: [{ role: "user", content: [
    { type: "text", text: "Extract the total" },
    inputs.file("https://example.com/receipt.jpg"),
  ]}],
});
```

## Structured output

```ts
import { responseFormat } from "interfaze";

const res = await interfaze.chat.completions.create({
  messages: [{ role: "user", content: "Weather in Tokyo?" }],
  response_format: responseFormat({
    type: "object",
    properties: { city: { type: "string" }, temp_c: { type: "number" } },
    required: ["city", "temp_c"],
  }),
});
const data = JSON.parse(res.choices[0].message.content!);
```

`responseFormat()` avoids the OpenAI zod-helper's client-side throws (non-object roots,
`.optional()` without `.nullable()`). With zod v4: `responseFormat(z.toJSONSchema(schema))`.

## Streaming

For live rendering, iterate `textDeltas()` — it yields visible text only, stripping Interfaze's
inline `<think>` / `<precontext>` side-channels:

```ts
const stream = interfaze.chat.completions.stream({
  messages: [{ role: "user", content: "Tell me a story." }],
});
for await (const text of stream.textDeltas()) {
  process.stdout.write(text);
}
const final = await stream.finalChatCompletion();
console.log(final.reasoning, final.precontext);
```

> Iterating the stream directly (`for await (const chunk of stream)`) or the plain
> `create({ stream: true })` path yields **raw** chunks whose `delta.content` still contains the
> `<think>` / `<precontext>` tags — use `textDeltas()` for anything user-facing. `.stream()` also
> tolerates Interfaze's role-less deltas (the OpenAI SDK's own `.stream()` throws
> `missing role for choice 0`) and surfaces `reasoning` / `precontext` on `finalChatCompletion()`.

## Inputs

```ts
import { inputs } from "interfaze";

inputs.image("https://…/a.png");                 // image_url part
inputs.file("https://…/doc.pdf");                // file part (pdf/csv/xml/json/txt/video…)
inputs.audio("https://…/a.wav");                 // input_audio part
await inputs.dataUrl(bytes, "image/png");         // base64 data URI (Uint8Array/ArrayBuffer/Blob)
await inputs.fromPath("./doc.pdf");               // Node-only: read a local file
```

URLs, base64 data URIs, and (for audio) `input_audio` all work. `image/gif` and `image/avif`
are rejected client-side (Interfaze does not accept them).

## Interfaze extras

- `res.precontext` — raw outputs of any internal tools that ran (OCR/web/scrape/STT/forecast/…).
- `res.reasoning` — reasoning text (with `reasoning_effort: "high"` and no schema).
- `res.vcache` — whether the semantic cache was hit.
- `reasoning_effort` accepts `"on" | "off" | "auto"` in addition to `minimal|low|medium|high`.
- Guardrails: `create({ guard: ["S1", "S12_IMAGE"], … })`.
- Control options: `new Interfaze({ showAdditionalInfo, bypassMoe, bypassCache, adminKey })`.

## Good to know

- Interfaze implements `chat.completions` and `models`. Other OpenAI endpoints
  (`embeddings`, `responses`, `audio.transcriptions`, …) are intentionally not exposed.
- `temperature` ≤ 1, `max_tokens` ≤ 32000, `top_p` ≤ 1 (values above → 400).
- Both `max_tokens` and `max_completion_tokens` bound output length (`max_tokens` wins if both set).
- `n`, `seed`, `stop`, penalties, `logprobs`, `tool_choice`, `top_k` are ignored by Interfaze.
- Requests default to a 900s timeout (large OCR/document/vision jobs are slow); override with
  `new Interfaze({ timeout: ... })` (milliseconds).
- The underlying OpenAI client is available at `interfaze.openai` as an escape hatch.

## License

MIT

# interfaze

The official [Interfaze](https://interfaze.ai) SDK for TypeScript/JavaScript

- **Familiar chat surface** - `chat.completions`, streaming, tools, and structured output.
- **Typed Interfaze extras** - `precontext` (internal tool output), `reasoning`, and `vcache` (semantic-cache hit) on every response.
- **One-line task helpers** - OCR, web search, scraping, speech-to-text, translation, object/GUI detection, forecasting.
- **Multimodal inputs** - images, PDFs, audio, video, and CSV, by URL or base64.
- **Universal** - Node 18+, browsers, and edge/workers; ESM + CommonJS; fully typed.

[Docs](https://interfaze.ai/docs) · [limits](https://interfaze.ai/docs/limits) · [pricing](https://interfaze.ai/pricing) · [dashboard](https://interfaze.ai) · [Python SDK](https://github.com/InterfazeAI/interfaze-python)

## Install

```bash
npm install interfaze
# or: yarn add interfaze · pnpm add interfaze · bun add interfaze
```

## Setup

```ts
import { Interfaze } from "interfaze";

const interfaze = new Interfaze({ apiKey: "sk_..." }); // or set INTERFAZE_API_KEY and call new Interfaze()
```

## Chat

```ts
const res = await interfaze.chat.completions.create({
  messages: [{ role: "user", content: "Write a haiku about deterministic AI." }],
});

res.choices[0]?.message.content;
res.vcache; // semantic-cache hit
```

A standard `ChatCompletion`, plus `vcache`, and `precontext`/`reasoning` when they apply.

### Streaming

```ts
const stream = interfaze.chat.completions.stream({
  messages: [{ role: "user", content: "Tell me a story." }],
});

for await (const text of stream.textDeltas()) process.stdout.write(text);

const final = await stream.finalChatCompletion(); // .reasoning, .precontext
```

`textDeltas()` yields display-ready text; `<think>`/`<precontext>` are stripped and returned structured on `finalChatCompletion()`.

### Structured output

```ts
import { responseFormat } from "interfaze";

const res = await interfaze.chat.completions.create({
  messages: [{ role: "user", content: "What is the current weather in Tokyo?" }],
  response_format: responseFormat({
    type: "object",
    properties: { city: { type: "string" }, temp_c: { type: "number" } },
    required: ["city", "temp_c"],
  }),
});
```

With zod: `responseFormat(z.toJSONSchema(schema))`.

### Reasoning

```ts
const res = await interfaze.chat.completions.create({
  reasoning_effort: "high", // also accepts Interfaze's on / off / auto
  messages: [{ role: "user", content: "Why is renewable energy important?" }],
});

res.reasoning;
```

### Tools and function calling

```ts
const res = await interfaze.chat.completions.create({
  messages: [{ role: "user", content: "What's the weather in Tokyo?" }],
  tools: [{ type: "function", function: { name: "get_weather", parameters: schema } }],
});

for (const call of res.choices[0]?.message.tool_calls ?? []) {
  if (call.type !== "function") continue;
  const args = JSON.parse(call.function.arguments);
}
```

## Inputs

By URL, dropped into a prompt:

```ts
import { inputs } from "interfaze";

await interfaze.chat.completions.create({
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "What's in this image, and summarize the PDF." },
        inputs.image("https://…/photo.png"),
        inputs.file("https://…/report.pdf"),
      ],
    },
  ],
});
```

From base64 / raw bytes URI:

```ts
inputs.image(await inputs.dataUrl(pngBytes, "image/png"));
inputs.file(await inputs.dataUrl(pdfBytes, "application/pdf"), { filename: "report.pdf" });
```

From a local file (Node) - `fromPath()` reads it into a `data:` URI:

```ts
inputs.image(await inputs.fromPath("./photo.png"));
inputs.file(await inputs.fromPath("./report.pdf"));
```

Audio and video:

```ts
inputs.audio("https://…/call.wav");                          // input_audio part
inputs.video("https://…/clip.mp4");                          // file part (no native video part)
inputs.video(await inputs.dataUrl(clipBytes, "video/mp4"));  // video from base64
```

`inputs.autoPart(src)` picks the part from the media type - image → `image_url`, audio → `input_audio`, else `file`. It's what the task helpers use.

## Tasks

Each helper forces one specialized tool - [faster and cheaper](https://interfaze.ai/docs/run-tasks) than a completion. All return `unknown`, so validate before use.

```ts
await interfaze.tasks.ocr(url);
await interfaze.tasks.objectDetection(url);
await interfaze.tasks.guiDetection(url);
await interfaze.tasks.webSearch(query);
await interfaze.tasks.scrape(url);
await interfaze.tasks.transcribe(url);
await interfaze.tasks.translate(text, { to: "Spanish" });
await interfaze.tasks.forecast(csvUrl, { periods: 30, unit: "days" });
```

Most take an optional `{ prompt }` to steer. For multi-part messages, pass `task` directly:

```ts
const res = await interfaze.chat.completions.create({
  task: "ocr",
  messages: [{ role: "user", content: [{ type: "text", text: "Extract the total." }, inputs.image(url)] }],
});
```

## Guardrails

```ts
const res = await interfaze.chat.completions.create({
  guard: ["S1", "S10", "S12_IMAGE"],
  messages: [{ role: "user", content: "..." }],
});
```

A match returns the plain string `unsafe S1` as the content. See the exported `GUARD_CODES` / `GUARD_LABELS`.

## Interfaze extras

Every response carries fields a plain OpenAI client drops:

```ts
const res = await interfaze.chat.completions.create({
  messages: [{ role: "user", content: "Extract the total from this receipt." }],
});

res.vcache;     // boolean - the semantic cache served this
res.reasoning;  // string - present with reasoning_effort and no schema
res.debug;      // admin-only payload (needs adminKey)

for (const p of res.precontext ?? []) {
  console.log(p.name, p.result); // ocr / web_search / scraper / stt / forecast / code_sandbox / …
}
```

Steer the router, cache, and streaming from the client:

```ts
const interfaze = new Interfaze({
  showAdditionalInfo: true, // stream <precontext> deltas as they're produced
  bypassMoe: true,          // skip the mixture-of-experts router
  bypassCache: true,        // skip the semantic cache
});
```

## Errors

```ts
import { BadRequestError, InterfazeError, RateLimitError } from "interfaze";
```

`InterfazeError` is client-side (missing key, invalid guard code, stream misuse). Everything else extends the OpenAI `APIError` with `status` and `code` - `BadRequestError` (400), `AuthenticationError` (401), `RateLimitError` (429), and so on.

## Examples

Runnable snippets in [`examples/`](./examples).

## License

MIT

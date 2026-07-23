# interfaze

The official [Interfaze](https://interfaze.ai) SDK for TypeScript/JavaScript

- **Familiar chat surface** - `chat.completions`, streaming, tools, and structured output.
- **Typed Interfaze extras** - `precontext` (internal tool output), `reasoning`, and `vcache` (semantic-cache hit) on every response.
- **One-line task helpers** - OCR, web search, scraping, speech-to-text, translation, object/GUI detection, forecasting.
- **Multimodal inputs** - images, PDFs, audio, video, and CSV, by URL or base64.
- **Universal** - Node 18+, browsers, and edge/workers; ESM + CommonJS; fully typed.

## Learn more

- [interfaze.ai](https://interfaze.ai) - dashboard and API keys.
- [Python SDK](https://github.com/InterfazeAI/interfaze-python).

## Capabilities

| Category         | Capabilities                                                |
| ---------------- | ----------------------------------------------------------- |
| **Chat & text**  | Chat completions, structured output, tools, reasoning       |
| **Vision & OCR** | `tasks.ocr` - text and structured data from images and PDFs |
| **Web**          | `tasks.webSearch`, `tasks.scrape`                           |
| **Audio**        | `tasks.transcribe` - speech-to-text                         |
| **Detection**    | `tasks.objectDetection`, `tasks.guiDetection`                |
| **Translation**  | `tasks.translate`                                           |
| **Forecasting**  | `tasks.forecast` - time-series prediction                   |

## Install

```bash
npm install interfaze
# or: yarn add interfaze · pnpm add interfaze · bun add interfaze
```

## Setup

Get an API key from the [Interfaze dashboard](https://interfaze.ai), then:

```ts
import { Interfaze } from "interfaze"; // or: import Interfaze from "interfaze"

const interfaze = new Interfaze({ apiKey: "sk_..." }); // or set INTERFAZE_API_KEY and call new Interfaze()
```

CommonJS: `const { Interfaze } = require("interfaze");`. `model` defaults to `interfaze-beta`.

## Usage

Chat completion:

```ts
const res = await interfaze.chat.completions.create({
  messages: [{ role: "user", content: "Write a haiku about deterministic AI." }],
});
console.log(res.choices[0].message.content);
console.log("cache hit:", res.vcache); // typed Interfaze extra
```

Task helpers - each returns the extracted result directly:

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

Structured output:

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

`responseFormat()` normalizes the schema (object-root wrap, `.optional()` → `.nullable()`); with zod v4 pass `responseFormat(z.toJSONSchema(schema))`.

Streaming - `.stream()` yields typed events, with the inline `<think>`/`<precontext>` side-channels stripped:

```ts
const stream = interfaze.chat.completions.stream({
  messages: [{ role: "user", content: "Tell me a story." }],
});
for await (const text of stream.textDeltas()) {
  process.stdout.write(text);
}
const final = await stream.finalChatCompletion();
```

> `stream.textDeltas()` yields clean visible text; iterating the stream directly gives the raw
> events, and `create({ stream: true })` gives the raw chunk iterator.

## Inputs

```ts
import { inputs } from "interfaze";

inputs.image("https://…/a.png");            // image_url part
inputs.file("https://…/doc.pdf");           // file part (pdf/csv/xml/json/txt/video…)
inputs.audio("https://…/a.wav");            // input_audio part
await inputs.dataUrl(bytes, "image/png");   // base64 data URI (Uint8Array/ArrayBuffer/Blob)
await inputs.fromPath("./doc.pdf");         // Node-only: read a local file
```

URLs and base64 both work; `image/gif` and `image/avif` are rejected client-side.

## Interfaze extras

- `res.precontext` - raw outputs of any internal tools that ran (OCR/web/scrape/STT/forecast/…).
- `res.reasoning` - reasoning text (with `reasoning_effort: "high"` and no schema).
- `res.vcache` - whether the semantic cache was hit.
- `reasoning_effort` also accepts `"on" | "off" | "auto"`.
- Guardrails: `create({ guard: ["S1", "S12_IMAGE"], … })`.
- Control options: `new Interfaze({ showAdditionalInfo, bypassMoe, bypassCache, adminKey })`.

## License

MIT

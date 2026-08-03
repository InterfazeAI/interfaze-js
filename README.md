# Interfaze Typescript and Javascript SDK

The official [Interfaze](https://interfaze.ai) SDK for TypeScript/JavaScript

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

## Your first request

This guide will get you started with your first request to Interfaze, which follows the Chat Completions API standard.

```ts
import { Interfaze, responseFormat } from "interfaze";
import { z } from "zod";

const interfaze = new Interfaze();

const IdCard = z.object({
  first_name: z.string(),
  last_name: z.string(),
  dob: z.string().describe("Date of birth on the ID"),
  licence_number: z.string(),
});

const res = await interfaze.chat.completions.create({
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "Extract the details from this ID." },
        {
          type: "image_url",
          image_url: {
            url: "https://r2public.jigsawstack.com/interfaze/examples/id.jpg",
          },
        },
      ],
    },
  ],
  response_format: responseFormat(z.toJSONSchema(IdCard), "id_card"),
});

const idCard = JSON.parse(res.choices[0]?.message.content ?? "{}");
console.log(idCard); // your IdCard schema
console.log("OCR result:", res.precontext?.[0]?.result); // the raw OCR that produced it
```

## Precontext

Alongside the answer, a response carries `precontext` - the raw metadata Interfaze produced while answering:

```ts
for (const p of res.precontext ?? []) {
  console.log(p.name, p.result); // e.g. "ocr" -> { text, boxes, confidence, … }
}
```

## Chat

```ts
const res = await interfaze.chat.completions.create({
  messages: [
    {
      role: "user",
      content: "Which US public companies reported earnings today?",
    },
  ],
});

res.choices[0]?.message.content;
```

The result is a standard `ChatCompletion` with `precontext`, and `reasoning` added (a web search backs the answer here).

### Streaming

Stream the reply as it's generated; the final completion still carries `precontext` and `reasoning`.

```ts
const stream = interfaze.chat.completions.stream({
  messages: [
    {
      role: "user",
      content: "Summarize this week's top AI research and cite your sources.",
    },
  ],
});

for await (const text of stream.textDeltas()) process.stdout.write(text);

const final = await stream.finalChatCompletion(); // .precontext (the sources), .reasoning
```

`textDeltas()` yields display-ready text - the inline `<think>`/`<precontext>` side-channels are stripped and returned structured on `finalChatCompletion()`. For the raw chunk iterator, use `create({ stream: true })`.

### Structured output

`parse()` sends a zod schema, validates the reply against it, and returns a typed object on `message.parsed` - no manual `JSON.parse`:

```ts
import { inputs, zodResponseFormat } from "interfaze";
import { z } from "zod";

const Receipt = z.object({
  merchant: z.string(),
  total: z.number(),
  items: z.array(z.object({ name: z.string(), price: z.number() })),
});

const res = await interfaze.chat.completions.parse({
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "Extract this receipt." }, inputs.image("https://jigsawstack.com/preview/vocr-example.jpg")],
    },
  ],
  response_format: zodResponseFormat(Receipt, "receipt"),
});

const receipt = res.choices[0]?.message.parsed; // typed `Receipt | null`
```

Prefer a raw JSON Schema (or no zod)? Use `create` with `responseFormat()` and read `message.content` yourself:

```ts
import { responseFormat } from "interfaze";

const res = await interfaze.chat.completions.create({
  messages: [{ role: "user", content: "..." }],
  response_format: responseFormat({ type: "object", properties: {}, required: [] }),
});
const data = JSON.parse(res.choices[0]?.message.content ?? "{}");
```

`responseFormat()` also accepts a zod schema via `z.toJSONSchema()`. `message.content` is a JSON string, and a non-object root is wrapped under a `result` key.

### Tools and function calling

Interfaze supports tools - define `tools`, read `message.tool_calls`, run them, then pass the results back for the final answer.

```ts
import type { ChatCompletionMessageParam, ChatCompletionTool } from "interfaze";

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get the current weather for a city.",
      parameters: {
        type: "object",
        properties: { city: { type: "string", description: "e.g. Tokyo" } },
        required: ["city"],
      },
    },
  },
];

const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "What's the weather in Tokyo?" }];

const res = await interfaze.chat.completions.create({
  messages,
  tools,
  tool_choice: "auto",
});

const message = res.choices[0]?.message;
if (message) messages.push(message); // the assistant turn, carrying any tool_calls

for (const call of message?.tool_calls ?? []) {
  if (call.type !== "function") continue;
  const { city } = JSON.parse(call.function.arguments);
  messages.push({
    role: "tool",
    tool_call_id: call.id,
    content: await getWeather(city),
  });
}

// send the tool results back for the final answer
const final = await interfaze.chat.completions.create({
  messages,
  tools,
  tool_choice: "auto",
});
```

## Reasoning

Ask for reasoning with `reasoning_effort`; the text comes back on `res.reasoning`.

```ts
const res = await interfaze.chat.completions.create({
  reasoning_effort: "high", // also accepts Interfaze's "on" / "off" / "auto"
  messages: [
    {
      role: "user",
      content: "Which region should we launch in first, and why?",
    },
  ],
});

res.reasoning; // reasoning text - present with reasoning_effort and no schema
```

## Multimodal Inputs

Interfaze handles images, PDFs, audio, video, and CSV. The simplest way is to drop a public URL into the prompt - Interfaze fetches and reads it:

```ts
await interfaze.chat.completions.create({
  messages: [
    {
      role: "user",
      content: "Summarize this document: https://arxiv.org/pdf/1706.03762",
    },
  ],
});
```

Or attach it as a content part - a `file` part for documents, audio, and video; `image_url` for images:

```ts
await interfaze.chat.completions.create({
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "Summarize this document." },
        {
          type: "file",
          file: {
            filename: "paper.pdf",
            file_data: "https://arxiv.org/pdf/1706.03762",
          },
        },
      ],
    },
  ],
});
```

`file_data` also takes a base64 data URI:

```ts
{ type: "file", file: { filename: "report.pdf", file_data: `data:application/pdf;base64,${base64}` } }
```

`inputs.*` is a typed shortcut that builds these parts - and turns raw bytes or a local file into a data URI for you:

```ts
import { inputs } from "interfaze";

inputs.image("https://…/photo.png"); // image_url part
inputs.file("https://…/report.pdf"); // file part
inputs.audio("https://…/call.wav"); // input_audio part
inputs.file(await inputs.dataUrl(pdfBytes, "application/pdf"), {
  filename: "report.pdf",
}); // bytes / Blob
inputs.image(await inputs.fromPath("./photo.png")); // Node: read a local file
```

Interfaze rejects `image/gif` and `image/avif` client-side, and `inputs.fromPath` is Node-only.

## Tasks

A task ([run_task](https://interfaze.ai/docs/run-tasks)) runs one built-in tool instead of the full model - faster and cheaper, but limited to that tool and its fixed output structure. So `task` can't be combined with a custom `response_format`; reach for a full completion (like [your first request](#your-first-request)) when you need the whole model or your own schema.

The `tasks.*` helpers are the shortest way - each takes a source and returns the raw result (typed `unknown`, so validate before use):

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

For a multi-part message (text plus an input), set `task` on a normal `create` call - the result comes back on `message.content`:

```ts
const res = await interfaze.chat.completions.create({
  task: "ocr",
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "Extract the total." }, inputs.image(url)],
    },
  ],
});
const { result } = JSON.parse(res.choices[0]?.message.content ?? "{}"); // same output as tasks.ocr()
```

Or a `<task>…</task>` system message plus an empty response schema:

```ts
import { emptyTaskSchema } from "interfaze";

const res = await interfaze.chat.completions.create({
  messages: [
    { role: "system", content: "<task>ocr</task>" },
    {
      role: "user",
      content: [{ type: "text", text: "Extract the total." }, inputs.image(url)],
    },
  ],
  response_format: emptyTaskSchema(), // an empty JSON schema
});
const { result } = JSON.parse(res.choices[0]?.message.content ?? "{}");
```

## Guardrails

Enable safety categories with `guard`; a blocked request comes back as a normal completion, not an exception.

```ts
const res = await interfaze.chat.completions.create({
  guard: ["S1", "S10", "S12_IMAGE"],
  messages: [{ role: "user", content: "..." }],
});
```

A match returns the plain string `unsafe S1` as `message.content` - so check for it. See the exported `GUARD_CODES` / `GUARD_LABELS`.

## Client options

Set router, cache, and streaming behavior once on the client:

```ts
const interfaze = new Interfaze({
  showAdditionalInfo: true, // stream <precontext> deltas as they're produced
  bypassMoA: true, // skip the mixture-of-agents router
  bypassCache: true, // skip the semantic cache
});
```

> **Zero data retention (ZDR)** is configured at the account/infrastructure level, not via a per-request flag or client header - contact Interfaze to enable it for your account.

## Errors

Interfaze re-exports typed error classes to catch and narrow on:

```ts
import { BadRequestError, InterfazeError, RateLimitError } from "interfaze";
```

`InterfazeError` is client-side (missing key, invalid guard code, stream misuse). Everything else is an `APIError` subclass carrying `status` and `code` - `BadRequestError` (400), `AuthenticationError` (401), `RateLimitError` (429), and so on.

> **Import error classes, types, and `toFile` from `interfaze` itself.** It re-exports everything you need, and these are the exact classes the SDK throws, so `instanceof` matches. If you also use another SDK that exports the same class names, those are a separate copy - `instanceof` won't match across the two, so compare on `err.status` / `err.code` to bridge them.

## Capabilities

| Use case                                | Entry point                                   |
| --------------------------------------- | --------------------------------------------- |
| [Chat](#chat)                           | `chat.completions.create`                     |
| [Streaming](#streaming)                 | `chat.completions.stream`                     |
| [Structured output](#structured-output) | `responseFormat()`                            |
| [Reasoning](#reasoning)                 | `reasoning_effort`                            |
| [Tools](#tools-and-function-calling)    | `tools`                                       |
| [Multimodal inputs](#inputs)            | `inputs.*`                                    |
| [OCR](#tasks)                           | `tasks.ocr`                                   |
| [Object and GUI detection](#tasks)      | `tasks.objectDetection`, `tasks.guiDetection` |
| [Web search and scraping](#tasks)       | `tasks.webSearch`, `tasks.scrape`             |
| [Speech to text](#tasks)                | `tasks.transcribe`                            |
| [Translation](#tasks)                   | `tasks.translate`                             |
| [Forecasting](#tasks)                   | `tasks.forecast`                              |
| [Guardrails](#guardrails)               | `guard`                                       |
| [Precontext](#precontext)               | `res.precontext`                              |

## Examples

Runnable snippets in [`examples/`](./examples).

## License

MIT

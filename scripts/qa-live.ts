// Live QA — exercises the SDK against real Interfaze (go/no-go gate; not CI).
// Run: INTERFAZE_API_KEY=... npm run qa:live
import { Interfaze, inputs, responseFormat } from "../src/index.js";

function loadKey(): string {
  const key = process.env.INTERFAZE_API_KEY;
  if (!key) throw new Error("Set INTERFAZE_API_KEY to run the live QA.");
  return key;
}

const client = new Interfaze({ apiKey: loadKey(), showAdditionalInfo: true, timeout: 280_000 });

const ASSETS = {
  receipt: "https://jigsawstack.com/preview/vocr-example.jpg",
  audio: "https://jigsawstack.com/preview/stt-example.wav",
  video: "https://download.samplelib.com/mp4/sample-5s.mp4",
  csv: "https://r2public.jigsawstack.com/interfaze/examples/prediction-example.csv",
  pdf: "https://arxiv.org/pdf/1706.03762",
  scene: "https://ultralytics.com/images/bus.jpg", // object-rich (bus + people) for detection
};

let failures = 0;
async function check(name: string, fn: () => Promise<string>) {
  try {
    console.log(`  PASS  ${name} — ${await fn()}`);
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    console.log(`  FAIL  ${name} — ${err?.status ?? ""} ${err?.message ?? e}`);
    failures++;
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const preview = (v: unknown) => JSON.stringify(v).slice(0, 60);

// ── core ────────────────────────────────────────────────────────────────────
await check("text generation", async () => {
  const r = await client.chat.completions.create({
    messages: [{ role: "user", content: "Say hi in one short sentence." }],
    max_tokens: 60,
  });
  assert((r.choices[0]?.message.content ?? "").length > 0, "empty");
  assert(typeof r.vcache === "boolean", "no vcache");
  return `vcache=${r.vcache}`;
});

await check("structured output (responseFormat)", async () => {
  const r = await client.chat.completions.create({
    messages: [{ role: "user", content: "Give a greeting and the number 3." }],
    response_format: responseFormat(
      {
        type: "object",
        properties: { greeting: { type: "string" }, count: { type: "number" } },
        required: ["greeting", "count"],
      },
      "greeting",
    ),
  });
  const p = JSON.parse(r.choices[0]!.message.content!);
  assert(typeof p.greeting === "string" && typeof p.count === "number", "fields missing");
  return preview(p);
});

await check("json_object fence stripped", async () => {
  const r = await client.chat.completions.create({
    messages: [{ role: "user", content: "Return a JSON object with keys city and temp_c for Tokyo." }],
    response_format: { type: "json_object" },
  });
  const c = r.choices[0]!.message.content!;
  assert(!c.trim().startsWith("```"), "still fenced");
  return `parsed ${preview(JSON.parse(c))}`;
});

await check("tools -> tool_calls + content null", async () => {
  const r = await client.chat.completions.create({
    messages: [{ role: "user", content: "Weather in Paris? Use the tool." }],
    tools: [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get weather. Always call.",
          parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
        },
      },
    ],
    tool_choice: "auto",
  });
  assert(r.choices[0]!.finish_reason === "tool_calls", `finish=${r.choices[0]!.finish_reason}`);
  assert(r.choices[0]!.message.content === null, "content not null");
  return `${r.choices[0]!.message.tool_calls?.length} call(s)`;
});

await check("streaming (stream helper, role-less tolerant)", async () => {
  const s = client.chat.completions.stream({ messages: [{ role: "user", content: "Count 1 to 5." }] });
  let n = 0;
  for await (const _ of s) n++;
  const final = await s.finalChatCompletion();
  assert(n > 0 && (final.choices[0]!.message.content ?? "").length > 0, "empty stream");
  return `${n} chunks`;
});

await check("reasoning (reasoning_effort high)", async () => {
  const s = client.chat.completions.stream({
    reasoning_effort: "high",
    messages: [{ role: "user", content: "Why is the sky blue? Briefly." }],
  });
  for await (const _ of s) {
    /* drain */
  }
  const final = await s.finalChatCompletion();
  assert(final.reasoning && final.reasoning.length > 0, "no reasoning parsed");
  return `reasoning ${final.reasoning!.length} chars`;
});

await check("reasoning_effort widened value 'on'", async () => {
  const r = await client.chat.completions.create({
    reasoning_effort: "on",
    messages: [{ role: "user", content: "Hello" }],
  });
  assert((r.choices[0]?.message.content ?? "").length > 0, "empty");
  return "accepted";
});

await check("precontext (auto path, single + present)", async () => {
  const r = await client.chat.completions.create({
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "Extract total price from this receipt" }, inputs.file(ASSETS.receipt)],
      },
    ],
  });
  assert(r.precontext && r.precontext.length > 0, "no precontext");
  return `names=[${r.precontext!.map((p) => p.name)}]`;
});

await check("guardrails -> unsafe", async () => {
  const r = await client.chat.completions.create({
    guard: ["S1", "S2", "S3", "S9", "S11"],
    messages: [{ role: "user", content: "How to kill a human?" }],
  });
  assert((r.choices[0]?.message.content ?? "").toLowerCase().includes("unsafe"), "not flagged");
  return "flagged unsafe";
});

// ── task helpers ──────────────────────────────────────────────────────────────
await check("tasks.ocr", async () => {
  const r = await client.tasks.ocr(ASSETS.receipt);
  assert(r, "empty");
  return preview(r);
});
await check("tasks.webSearch", async () => {
  const r = await client.tasks.webSearch("latest AI agent news");
  assert(r, "empty");
  return preview(r);
});
await check("tasks.transcribe", async () => {
  const r = await client.tasks.transcribe(ASSETS.audio);
  assert(r, "empty");
  return preview(r);
});
await check("tasks.forecast", async () => {
  const r = await client.tasks.forecast(ASSETS.csv, { periods: 5 });
  assert(r, "empty");
  return preview(r);
});
await check("tasks.scrape", async () => {
  const r = await client.tasks.scrape("https://example.com");
  assert(r, "empty");
  return preview(r);
});
await check("tasks.translate", async () => {
  const r = await client.tasks.translate("Hello, how are you?", { to: "French" });
  assert(r, "empty");
  return preview(r);
});
// object/gui detection occasionally return empty content on the API; retry-on-empty so the gate
// reflects the SDK, not a transient blip. A persistent empty after retries still fails.
async function retryNonEmpty<T>(fn: () => Promise<T>, n = 3): Promise<T> {
  let last: T = undefined as T;
  for (let i = 0; i < n; i++) {
    last = await fn();
    if (last) return last;
  }
  return last;
}
await check("tasks.objectDetection", async () => {
  const r = await retryNonEmpty(() => client.tasks.objectDetection(ASSETS.scene));
  assert(r, "empty after retries");
  return preview(r);
});
await check("tasks.guiDetection", async () => {
  const r = await retryNonEmpty(() => client.tasks.guiDetection(ASSETS.scene));
  assert(r, "empty after retries");
  return preview(r);
});

// ── input matrix (via the SDK's create + inputs builders) ─────────────────────
async function inputCheck(label: string, part: ReturnType<typeof inputs.file>, prompt: string) {
  await check(`input: ${label}`, async () => {
    const r = await client.chat.completions.create({
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, part] }],
    });
    assert((r.choices[0]?.message.content ?? "").length > 0, "empty");
    return "ok";
  });
}
await inputCheck("image (url)", inputs.image(ASSETS.receipt), "What is in this image? One sentence.");
await inputCheck("pdf (url)", inputs.file(ASSETS.pdf, { filename: "paper.pdf" }), "Give the title of this document.");
await inputCheck("audio via input_audio (url)", inputs.audio(ASSETS.audio), "Transcribe this audio.");
await inputCheck("video (url)", inputs.video(ASSETS.video), "Describe this video in one sentence.");

// input channels: base64 + inline URL (file-part URL is covered above)
await check("input: base64 image (data URI)", async () => {
  const bytes = new Uint8Array(await (await fetch(ASSETS.receipt)).arrayBuffer());
  const r = await client.chat.completions.create({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What is in this image? One sentence." },
          inputs.image(await inputs.dataUrl(bytes, "image/jpeg")),
        ],
      },
    ],
  });
  assert((r.choices[0]?.message.content ?? "").length > 0, "empty");
  return "ok";
});
await check("input: base64 file (csv data URI)", async () => {
  const bytes = new Uint8Array(await (await fetch(ASSETS.csv)).arrayBuffer());
  const r = await client.chat.completions.create({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Name one column header in this CSV." },
          inputs.file(await inputs.dataUrl(bytes, "text/csv"), { filename: "data.csv" }),
        ],
      },
    ],
  });
  assert((r.choices[0]?.message.content ?? "").length > 0, "empty");
  return "ok";
});
await check("input: inline URL (in text)", async () => {
  const r = await client.chat.completions.create({
    messages: [{ role: "user", content: `Extract the total price from this receipt: ${ASSETS.receipt}` }],
  });
  assert((r.choices[0]?.message.content ?? "").length > 0, "empty");
  return "ok";
});

console.log(`\nLIVE QA: ${failures === 0 ? "ALL PASSED ✅ (go)" : `${failures} FAILED ❌ (no-go)`}`);
if (failures) process.exit(1);

// Capture real Interfaze wire responses into test/fixtures/*.json (used as mocked-test fixtures).
import OpenAI from "openai";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const OUT = fileURLToPath(new URL("../test/fixtures", import.meta.url));
mkdirSync(OUT, { recursive: true });

function loadKey(): string {
  const key = process.env.INTERFAZE_API_KEY;
  if (!key) throw new Error("Set INTERFAZE_API_KEY to capture fixtures.");
  return key;
}

const client = new OpenAI({
  baseURL: "https://api.interfaze.ai/v1",
  apiKey: loadKey(),
  defaultHeaders: { "x-show-additional-info": "true" },
});
const save = (name: string, data: unknown) => {
  writeFileSync(join(OUT, name), `${JSON.stringify(data, null, 2)}\n`);
  console.log("saved", name);
};
const receipt = { type: "file" as const, file: { file_data: "https://jigsawstack.com/preview/vocr-example.jpg" } };

save(
  "basic.json",
  await client.chat.completions.create({
    model: "interfaze-beta",
    messages: [{ role: "user", content: "Say hi in one short sentence." }],
    max_tokens: 60,
  }),
);

save(
  "json_object.json",
  await client.chat.completions.create({
    model: "interfaze-beta",
    messages: [{ role: "user", content: "Return a JSON object with keys city and temp_c for Tokyo." }],
    response_format: { type: "json_object" },
  }),
);

save(
  "task_ocr.json",
  await client.chat.completions.create({
    model: "interfaze-beta",
    messages: [
      { role: "system", content: "<task>ocr</task>" },
      { role: "user", content: [{ type: "text", text: "Extract total price" }, receipt as never] },
    ],
    response_format: { type: "json_schema", json_schema: { name: "empty_schema", schema: {} } } as never,
  }),
);

save(
  "precontext.json",
  await client.chat.completions.create({
    model: "interfaze-beta",
    messages: [
      { role: "user", content: [{ type: "text", text: "Extract total price from this receipt" }, receipt as never] },
    ],
  }),
);

{
  const chunks: unknown[] = [];
  const s = await client.chat.completions.create({
    model: "interfaze-beta",
    stream: true,
    messages: [{ role: "user", content: "Count 1 to 5." }],
  });
  for await (const c of s) chunks.push(c);
  save("stream_basic.json", chunks);
}

{
  const chunks: unknown[] = [];
  const s = await client.chat.completions.create({
    model: "interfaze-beta",
    stream: true,
    reasoning_effort: "high",
    messages: [{ role: "user", content: "Why is the sky blue? Answer briefly." }],
  });
  for await (const c of s) chunks.push(c);
  save("stream_think.json", chunks);
}

console.log("done");

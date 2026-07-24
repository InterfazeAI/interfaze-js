import { describe, expect, it } from "vitest";
import { toInterfaze } from "../src/chat.js";
import { HEADERS } from "../src/constants.js";
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions/completions";
import { completion, fixture, jsonResponse, mockInterfaze, sseResponse, systemContent } from "./helpers.js";

function functionName(call: ChatCompletionMessageToolCall): string {
  if (call.type !== "function") throw new Error("expected a function tool call");
  return call.function.name;
}

const basic = fixture("basic.json");
const jsonObject = fixture("json_object.json");
const taskOcr = fixture("task_ocr.json");
const precontext = fixture("precontext.json");
const streamBasic = fixture<unknown[]>("stream_basic.json");

const WEATHER_TOOL = [
  {
    type: "function" as const,
    function: {
      name: "get_weather",
      parameters: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
    },
  },
];

describe("request serialization", () => {
  it("targets the Interfaze base URL and defaults the model", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(basic));
    await interfaze.chat.completions.create({ messages: [{ role: "user", content: "hi" }] });
    expect(calls[0]!.url).toContain("https://api.interfaze.ai/v1");
    expect(calls[0]!.body!["model"]).toBe("interfaze-beta");
  });

  it("serializes `task` into a <task> system message + empty json_schema", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(taskOcr));
    await interfaze.chat.completions.create({ task: "ocr", messages: [{ role: "user", content: "x" }] });
    expect(systemContent(calls[0]!.body)).toContain("<task>ocr</task>");
    const rf = calls[0]!.body!["response_format"] as { type: string; json_schema: { schema: unknown } };
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema.schema).toEqual({});
  });

  it("serializes `guard` into a <guard> system message", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(basic));
    await interfaze.chat.completions.create({ guard: ["S1", "S12_IMAGE"], messages: [{ role: "user", content: "x" }] });
    expect(systemContent(calls[0]!.body)).toContain("<guard>S1, S12_IMAGE</guard>");
  });

  it("accepts `forecast` as a task", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(basic));
    await interfaze.chat.completions.create({ task: "forecast", messages: [{ role: "user", content: "x" }] });
    expect(systemContent(calls[0]!.body)).toContain("<task>forecast</task>");
  });

  it("merges task/guard tags into an existing system message", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(taskOcr));
    await interfaze.chat.completions.create({
      task: "ocr",
      guard: ["S1"],
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "x" },
      ],
    });
    const msgs = calls[0]!.body!["messages"] as Array<{ role: string; content: string }>;
    const systems = msgs.filter((m) => m.role === "system");
    expect(systems).toHaveLength(1);
    expect(systems[0]!.content).toContain("<task>ocr</task>");
    expect(systems[0]!.content).toContain("<guard>S1</guard>");
    expect(systems[0]!.content).toContain("You are helpful.");
  });

  it("rejects a non-empty schema combined with a task (client-side, mirrors the server 400)", () => {
    const { interfaze } = mockInterfaze(() => jsonResponse(basic));
    // Argument-validation errors throw synchronously (programmer error), like guardTag().
    expect(() =>
      interfaze.chat.completions.create({
        task: "ocr",
        messages: [{ role: "user", content: "x" }],
        response_format: {
          type: "json_schema",
          json_schema: { name: "s", schema: { type: "object", properties: { a: { type: "string" } } } },
        },
      }),
    ).toThrow(/non-empty `response_format` cannot be combined with `task`/);
  });

  it("forwards the widened reasoning_effort value (`on`) untouched", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(basic));
    await interfaze.chat.completions.create({ reasoning_effort: "on", messages: [{ role: "user", content: "x" }] });
    expect(calls[0]!.body!["reasoning_effort"]).toBe("on");
  });

  it("merges tags into an existing system message that carries a `name`", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(taskOcr));
    await interfaze.chat.completions.create({
      task: "ocr",
      messages: [
        { role: "system", content: "You are helpful.", name: "sys" },
        { role: "user", content: "x" },
      ],
    });
    const msgs = calls[0]!.body!["messages"] as Array<{ role: string; content: string; name?: string }>;
    const systems = msgs.filter((m) => m.role === "system");
    expect(systems).toHaveLength(1);
    expect(systems[0]!.name).toBe("sys");
    expect(systems[0]!.content).toContain("<task>ocr</task>");
  });

  it("prepends a new system message when the existing one has non-string content", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(taskOcr));
    await interfaze.chat.completions.create({
      task: "ocr",
      messages: [
        { role: "system", content: [{ type: "text", text: "You are helpful." }] as never },
        { role: "user", content: "x" },
      ],
    });
    const msgs = calls[0]!.body!["messages"] as Array<{ role: string; content: unknown }>;
    const systems = msgs.filter((m) => m.role === "system");
    expect(systems).toHaveLength(2);
    expect(systems[0]!.content).toBe("<task>ocr</task>");
  });

  it("maps control options to headers", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(basic), {
      showAdditionalInfo: true,
      bypassCache: true,
    });
    await interfaze.chat.completions.create({ messages: [{ role: "user", content: "x" }] });
    expect(calls[0]!.headers.get(HEADERS.showAdditionalInfo)).toBe("true");
    expect(calls[0]!.headers.get(HEADERS.bypassCache)).toBe("true");
  });

  it("maps every control option to its header, including bypassMoe and adminKey", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(basic), {
      showAdditionalInfo: true,
      bypassMoe: true,
      bypassCache: true,
      adminKey: "admin-secret",
    });
    await interfaze.chat.completions.create({ messages: [{ role: "user", content: "x" }] });
    const h = calls[0]!.headers;
    expect(h.get(HEADERS.showAdditionalInfo)).toBe("true");
    expect(h.get(HEADERS.bypassMoe)).toBe("true");
    expect(h.get(HEADERS.bypassCache)).toBe("true");
    expect(h.get(HEADERS.adminKey)).toBe("admin-secret");
  });

  it("omits every control header when none are set", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(basic));
    await interfaze.chat.completions.create({ messages: [{ role: "user", content: "x" }] });
    const h = calls[0]!.headers;
    expect(h.has(HEADERS.showAdditionalInfo)).toBe(false);
    expect(h.has(HEADERS.bypassMoe)).toBe(false);
    expect(h.has(HEADERS.bypassCache)).toBe(false);
    expect(h.has(HEADERS.adminKey)).toBe(false);
  });

  it("lets a per-request extra header override the client default", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(basic), { adminKey: "client-default" });
    await interfaze.chat.completions.create(
      { messages: [{ role: "user", content: "x" }] },
      { headers: { [HEADERS.adminKey]: "per-request-override" } },
    );
    expect(calls[0]!.headers.get(HEADERS.adminKey)).toBe("per-request-override");
  });

  it("forwards arbitrary extra top-level fields straight through to the request body", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(basic));
    await interfaze.chat.completions.create({
      messages: [{ role: "user", content: "x" }],
      custom: true,
    } as never);
    expect(calls[0]!.body!["custom"]).toBe(true);
  });
});

describe("response mapping", () => {
  it("surfaces vcache (always) on the extended completion", async () => {
    const { interfaze } = mockInterfaze(() => jsonResponse(basic));
    const r = await interfaze.chat.completions.create({ messages: [{ role: "user", content: "hi" }] });
    expect(typeof r.vcache).toBe("boolean");
  });

  it("surfaces precontext when Interfaze ran a tool", async () => {
    const { interfaze } = mockInterfaze(() => jsonResponse(precontext));
    const r = await interfaze.chat.completions.create({ messages: [{ role: "user", content: "extract" }] });
    expect(Array.isArray(r.precontext)).toBe(true);
    expect(r.precontext!.length).toBeGreaterThan(0);
    expect(r.precontext![0]!.name).toBe("ocr");
  });

  it("strips the ```json fence from json_object content", async () => {
    const { interfaze } = mockInterfaze(() => jsonResponse(jsonObject));
    const r = await interfaze.chat.completions.create({
      messages: [{ role: "user", content: "json" }],
      response_format: { type: "json_object" },
    });
    const content = r.choices[0]!.message.content!;
    expect(content.startsWith("```")).toBe(false);
    expect(() => JSON.parse(content)).not.toThrow();
    expect(JSON.parse(content)).toHaveProperty("city");
  });

  it("does NOT strip fences when response_format is not json_object", async () => {
    // basic.json content is plain ("Hi!"); a code-fenced prose answer must be preserved.
    const fenced = structuredClone(basic) as { choices: { message: { content: string } }[] };
    fenced.choices[0]!.message.content = "```js\nconsole.log(1)\n```";
    const { interfaze } = mockInterfaze(() => jsonResponse(fenced));
    const r = await interfaze.chat.completions.create({ messages: [{ role: "user", content: "code" }] });
    expect(r.choices[0]!.message.content).toContain("```js");
  });

  it("preserves the raw HTTP response via .withResponse() (guards the _thenUnwrap mapping)", async () => {
    const { interfaze } = mockInterfaze(() => jsonResponse(basic));
    const { data, response } = await interfaze.chat.completions
      .create({ messages: [{ role: "user", content: "hi" }] })
      .withResponse();
    expect(response.status).toBe(200);
    expect(typeof data.vcache).toBe("boolean");
    expect(data.choices[0]!.message.content).toBeDefined();
  });

  it("tolerates a raw tool-call entry mixed into precontext (no `name`, no crash)", async () => {
    const mixed = completion("Ran the code.", {
      precontext: [
        { name: "ocr", result: { extracted_text: "x" } },
        { toolCallId: "call_1", toolName: "run_code", input: { code: "print(1)" } },
      ],
    });
    const { interfaze } = mockInterfaze(() => jsonResponse(mixed));
    const r = await interfaze.chat.completions.create({ messages: [{ role: "user", content: "run code" }] });
    expect(r.precontext).toHaveLength(2);
    expect(r.precontext![0]!.name).toBe("ocr");
    expect(r.precontext![0]!.result).toEqual({ extracted_text: "x" });
    expect(r.precontext![1]!.name).toBeUndefined();
    expect((r.precontext![1] as unknown as { toolName: string }).toolName).toBe("run_code");
  });

  it("surfaces top-level `reasoning` text", async () => {
    const reasoning = completion("The sky is blue because...", {
      reasoning: "Rayleigh scattering means shorter wavelengths...",
    });
    const { interfaze } = mockInterfaze(() => jsonResponse(reasoning));
    const r = await interfaze.chat.completions.create({ messages: [{ role: "user", content: "x" }] });
    expect(r.reasoning).toContain("Rayleigh");
  });

  it("leaves tool-call responses with content: null untouched", async () => {
    const toolCall = completion(null, {
      finishReason: "tool_calls",
      toolCalls: [
        { id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city": "Paris"}' } },
      ],
    });
    const { interfaze } = mockInterfaze(() => jsonResponse(toolCall));
    const r = await interfaze.chat.completions.create({
      messages: [{ role: "user", content: "weather?" }],
      tools: WEATHER_TOOL,
      tool_choice: "auto",
    });
    expect(r.choices[0]!.finish_reason).toBe("tool_calls");
    expect(r.choices[0]!.message.content).toBeNull();
    expect(functionName(r.choices[0]!.message.tool_calls![0]!)).toBe("get_weather");
  });

  it("surfaces usage tokens", async () => {
    const { interfaze } = mockInterfaze(() => jsonResponse(basic));
    const r = await interfaze.chat.completions.create({ messages: [{ role: "user", content: "hi" }] });
    expect(r.usage).toEqual((basic as ChatCompletion).usage);
  });

  it("passes json_object content through unchanged when it wasn't fenced to begin with", async () => {
    const { interfaze } = mockInterfaze(() => jsonResponse(completion('{"city": "Tokyo"}')));
    const r = await interfaze.chat.completions.create({
      messages: [{ role: "user", content: "x" }],
      response_format: { type: "json_object" },
    });
    expect(JSON.parse(r.choices[0]!.message.content!)["city"]).toBe("Tokyo");
  });

  it("does not crash fence-stripping when json_object is combined with a tool-call (content: null)", async () => {
    const toolCall = completion(null, {
      finishReason: "tool_calls",
      toolCalls: [{ id: "call_1", type: "function", function: { name: "get_weather", arguments: "{}" } }],
    });
    const { interfaze } = mockInterfaze(() => jsonResponse(toolCall));
    const r = await interfaze.chat.completions.create({
      messages: [{ role: "user", content: "weather?" }],
      tools: WEATHER_TOOL,
      response_format: { type: "json_object" },
    });
    expect(r.choices[0]!.message.content).toBeNull();
    expect(functionName(r.choices[0]!.message.tool_calls![0]!)).toBe("get_weather");
  });

  it("toInterfaze tolerates a malformed completion with no choices", () => {
    const fakeRaw = {
      id: "x",
      object: "chat.completion",
      created: 1,
      model: "m",
      choices: [],
      vcache: false,
    } as unknown as ChatCompletion;
    const result = toInterfaze(fakeRaw, { stripFence: true });
    expect(result.choices).toEqual([]);
  });

  it("create({ stream: true }) hands back the raw openai stream, not the InterfazeChatCompletionStream wrapper", async () => {
    const { interfaze } = mockInterfaze(() => sseResponse(streamBasic));
    const rawStream = await interfaze.chat.completions.create({
      messages: [{ role: "user", content: "x" }],
      stream: true,
    });
    const chunks: ChatCompletionChunk[] = [];
    for await (const chunk of rawStream) chunks.push(chunk);
    expect(chunks).toHaveLength(streamBasic.length);
    expect(chunks[0]!.choices[0]!.delta.content).toBeDefined();
  });
});

import { describe, expect, it } from "vitest";
import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions/completions";
import { fixture, mockInterfaze, sseResponse } from "./helpers.js";

function asFunctionCall(call: ChatCompletionMessageToolCall) {
  if (call.type !== "function") throw new Error("expected a function tool call");
  return call.function;
}

const streamBasic = fixture<unknown[]>("stream_basic.json"); // role-less chunks; chunk 0 has a <precontext> block
const streamThink = fixture<unknown[]>("stream_think.json"); // contains <think>, no <precontext>

const mkChunk = (delta: object, finish: string | null = null) => ({
  id: "req-x",
  object: "chat.completion.chunk",
  created: 1,
  model: "interfaze-beta",
  choices: [{ index: 0, delta, finish_reason: finish }],
});

// A plain stream with NO side-channels (neither <think> nor <precontext>) — the accumulator must not hang.
const plainChunks = [
  mkChunk({ content: "Hello " }),
  mkChunk({ content: "world" }),
  mkChunk({}, "stop"),
];

const fencedJson = [
  mkChunk({ content: "```json\n" }),
  mkChunk({ content: '{"city": "Tokyo"}' }),
  mkChunk({ content: "\n```" }),
  mkChunk({}, "stop"),
];

describe("streaming accumulator", () => {
  it("iterates role-less chunks without throwing 'missing role'", async () => {
    const { interfaze } = mockInterfaze(() => sseResponse(streamBasic));
    const s = interfaze.chat.completions.stream({ messages: [{ role: "user", content: "count" }] });
    let n = 0;
    for await (const _chunk of s) n++;
    expect(n).toBe(streamBasic.length);
  });

  it("finalChatCompletion assembles content and tolerates a missing role", async () => {
    const { interfaze } = mockInterfaze(() => sseResponse(streamBasic));
    const s = interfaze.chat.completions.stream({ messages: [{ role: "user", content: "count" }] });
    const final = await s.finalChatCompletion();
    expect(final.choices[0]!.message.role).toBe("assistant");
    expect(typeof final.choices[0]!.message.content).toBe("string");
    expect(final.choices[0]!.message.content).not.toContain("<precontext>");
  });

  it("parses <precontext> out of the stream", async () => {
    const { interfaze } = mockInterfaze(() => sseResponse(streamBasic));
    const s = interfaze.chat.completions.stream({ messages: [{ role: "user", content: "count" }] });
    const final = await s.finalChatCompletion();
    expect(final.precontext?.length).toBeGreaterThan(0);
    expect(typeof final.precontext![0]!.name).toBe("string");
  });

  it("parses <think> reasoning and removes it from visible text", async () => {
    const { interfaze } = mockInterfaze(() => sseResponse(streamThink));
    const s = interfaze.chat.completions.stream({ reasoning_effort: "high", messages: [{ role: "user", content: "why" }] });
    const final = await s.finalChatCompletion();
    expect(final.reasoning).toBeTruthy();
    expect(final.choices[0]!.message.content).not.toContain("<think>");
    expect(final.precontext).toBeUndefined(); // absent side-channel must not break assembly
  });

  it("handles a stream with no side-channels", async () => {
    const { interfaze } = mockInterfaze(() => sseResponse(plainChunks));
    const s = interfaze.chat.completions.stream({ messages: [{ role: "user", content: "hi" }] });
    const final = await s.finalChatCompletion();
    expect(final.choices[0]!.message.content).toBe("Hello world");
    expect(final.reasoning).toBeUndefined();
    expect(final.precontext).toBeUndefined();
    expect(final.choices[0]!.finish_reason).toBe("stop");
  });

  it("finalChatCompletion works without iterating first", async () => {
    const { interfaze } = mockInterfaze(() => sseResponse(plainChunks));
    const final = await interfaze.chat.completions
      .stream({ messages: [{ role: "user", content: "hi" }] })
      .finalChatCompletion();
    expect(final.choices[0]!.message.content).toBe("Hello world");
  });

  it("textDeltas() strips <precontext> and yields only visible text", async () => {
    const { interfaze } = mockInterfaze(() => sseResponse(streamBasic));
    const s = interfaze.chat.completions.stream({ messages: [{ role: "user", content: "count" }] });
    let text = "";
    for await (const piece of s.textDeltas()) text += piece;
    expect(text).not.toContain("<precontext>");
    expect(text).toBe("1\n2\n3\n4\n5");
  });

  it("textDeltas() strips <think> and yields only the answer", async () => {
    const { interfaze } = mockInterfaze(() => sseResponse(streamThink));
    const s = interfaze.chat.completions.stream({ reasoning_effort: "high", messages: [{ role: "user", content: "why" }] });
    let text = "";
    for await (const piece of s.textDeltas()) text += piece;
    expect(text).not.toContain("<think>");
    expect(text).toContain("because of"); // from the visible answer
    expect(text).not.toContain("due to"); // only in the suppressed <think> body
  });

  it("textDeltas() buffers a tag split across chunks", async () => {
    const splitTag = [
      mkChunk({ content: "Hello <pre" }),
      mkChunk({ content: 'context>[{"name":"ocr","result":1}]</precon' }),
      mkChunk({ content: "text> world" }),
      mkChunk({}, "stop"),
    ];
    const { interfaze } = mockInterfaze(() => sseResponse(splitTag));
    const s = interfaze.chat.completions.stream({ messages: [{ role: "user", content: "x" }] });
    let text = "";
    for await (const piece of s.textDeltas()) text += piece;
    expect(text).not.toContain("precontext");
    expect(text).toBe("Hello  world");
  });

  it("textDeltas() preserves a literal '<'", async () => {
    const literals = [mkChunk({ content: "a < b and c " }), mkChunk({ content: "< d" }), mkChunk({}, "stop")];
    const { interfaze } = mockInterfaze(() => sseResponse(literals));
    const s = interfaze.chat.completions.stream({ messages: [{ role: "user", content: "x" }] });
    let text = "";
    for await (const piece of s.textDeltas()) text += piece;
    expect(text).toBe("a < b and c < d");
  });

  it("finalChatCompletion strips the json_object fence", async () => {
    const { interfaze } = mockInterfaze(() => sseResponse(fencedJson));
    const s = interfaze.chat.completions.stream({
      messages: [{ role: "user", content: "json" }],
      response_format: { type: "json_object" },
    });
    const content = (await s.finalChatCompletion()).choices[0]!.message.content!;
    expect(content.startsWith("```")).toBe(false);
    expect(JSON.parse(content)).toHaveProperty("city");
  });

  it("keeps a fence when response_format is not json_object", async () => {
    const { interfaze } = mockInterfaze(() => sseResponse(fencedJson));
    const s = interfaze.chat.completions.stream({ messages: [{ role: "user", content: "x" }] });
    const content = (await s.finalChatCompletion()).choices[0]!.message.content!;
    expect(content.startsWith("```")).toBe(true);
  });

  it("accumulates a streamed tool call and surfaces it on finalChatCompletion", async () => {
    const toolCallChunks = [
      mkChunk({
        tool_calls: [
          { index: 0, id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"ci' } },
        ],
      }),
      mkChunk({ tool_calls: [{ index: 0, function: { arguments: 'ty": "Pa' } }] }),
      mkChunk({ tool_calls: [{ index: 0, function: { arguments: 'ris"}' } }] }, "tool_calls"),
    ];
    const { interfaze } = mockInterfaze(() => sseResponse(toolCallChunks));
    const s = interfaze.chat.completions.stream({ messages: [{ role: "user", content: "weather?" }] });
    const final = await s.finalChatCompletion();
    expect(final.choices[0]!.finish_reason).toBe("tool_calls");
    expect(final.choices[0]!.message.content).toBeNull();
    const toolCalls = final.choices[0]!.message.tool_calls!;
    expect(toolCalls[0]!.id).toBe("call_1");
    expect(asFunctionCall(toolCalls[0]!).name).toBe("get_weather");
    expect(asFunctionCall(toolCalls[0]!).arguments).toBe('{"city": "Paris"}');
  });

  it("swallows malformed JSON inside <precontext> without crashing", async () => {
    const malformed = [
      mkChunk({ content: "<precontext>[not valid json]</precontext>" }),
      mkChunk({ content: "Answer anyway." }, "stop"),
    ];
    const { interfaze } = mockInterfaze(() => sseResponse(malformed));
    const s = interfaze.chat.completions.stream({ messages: [{ role: "user", content: "x" }] });
    const final = await s.finalChatCompletion();
    expect(final.precontext).toBeUndefined();
    expect(final.choices[0]!.message.content).toBe("Answer anyway.");
  });

  it("accepts a <precontext> block containing a single object (not an array)", async () => {
    const singleObject = [
      mkChunk({ content: '<precontext>{"name":"ocr","result":{"extracted_text":"x"}}</precontext>' }),
      mkChunk({ content: "Done." }, "stop"),
    ];
    const { interfaze } = mockInterfaze(() => sseResponse(singleObject));
    const s = interfaze.chat.completions.stream({ messages: [{ role: "user", content: "x" }] });
    const final = await s.finalChatCompletion();
    expect(final.precontext).toHaveLength(1);
    expect(final.precontext![0]!.name).toBe("ocr");
  });

  it(".text reflects the visible content accumulated so far", async () => {
    const { interfaze } = mockInterfaze(() => sseResponse(streamBasic));
    const s = interfaze.chat.completions.stream({ messages: [{ role: "user", content: "count" }] });
    for await (const _chunk of s) {
      // drain
    }
    expect(s.text).not.toContain("<precontext>");
    expect(s.text.length).toBeGreaterThan(0);
  });

  it("finalChatCompletion() throws if called after breaking out of iteration early", async () => {
    const { interfaze } = mockInterfaze(() => sseResponse(streamBasic));
    const s = interfaze.chat.completions.stream({ messages: [{ role: "user", content: "count" }] });
    for await (const _chunk of s) {
      break;
    }
    await expect(s.finalChatCompletion()).rejects.toThrow(/fully iterating/);
  });

  it("textDeltas() swallows an unterminated tag left open at stream end", async () => {
    const unterminated = [
      mkChunk({ content: "Hello <precontext>[never closed" }),
      mkChunk({}, "stop"),
    ];
    const { interfaze } = mockInterfaze(() => sseResponse(unterminated));
    const s = interfaze.chat.completions.stream({ messages: [{ role: "user", content: "x" }] });
    let text = "";
    for await (const piece of s.textDeltas()) text += piece;
    expect(text).toBe("Hello ");
  });
});

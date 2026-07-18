import { describe, expect, it } from "vitest";
import { fixture, mockInterfaze, sseResponse } from "./helpers.js";

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
});

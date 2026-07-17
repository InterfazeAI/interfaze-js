import { describe, expect, it } from "vitest";
import { fixture, mockInterfaze, sseResponse } from "./helpers.js";

const streamBasic = fixture<unknown[]>("stream_basic.json"); // role-less chunks; chunk 0 has a <precontext> block
const streamThink = fixture<unknown[]>("stream_think.json"); // contains <think>, no <precontext>

// A plain stream with NO side-channels (neither <think> nor <precontext>) — the accumulator must not hang.
const plainChunks = [
  { id: "req-x", object: "chat.completion.chunk", created: 1, model: "interfaze-beta", choices: [{ index: 0, delta: { content: "Hello " }, finish_reason: null }] },
  { id: "req-x", object: "chat.completion.chunk", created: 1, model: "interfaze-beta", choices: [{ index: 0, delta: { content: "world" }, finish_reason: null }] },
  { id: "req-x", object: "chat.completion.chunk", created: 1, model: "interfaze-beta", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
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
});

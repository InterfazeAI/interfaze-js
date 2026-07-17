import { describe, expect, it } from "vitest";
import { HEADERS } from "../src/constants.js";
import { fixture, jsonResponse, mockInterfaze, systemContent } from "./helpers.js";

const basic = fixture("basic.json");
const jsonObject = fixture("json_object.json");
const taskOcr = fixture("task_ocr.json");
const precontext = fixture("precontext.json");

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

  it("rejects a non-empty schema combined with a task (client-side, mirrors the server 400)", () => {
    const { interfaze } = mockInterfaze(() => jsonResponse(basic));
    // Argument-validation errors throw synchronously (programmer error), like guardTag().
    expect(() =>
      interfaze.chat.completions.create({
        task: "ocr",
        messages: [{ role: "user", content: "x" }],
        response_format: { type: "json_schema", json_schema: { name: "s", schema: { type: "object", properties: { a: { type: "string" } } } } },
      }),
    ).toThrow(/non-empty `response_format` cannot be combined with `task`/);
  });

  it("forwards the widened reasoning_effort value (`on`) untouched", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(basic));
    await interfaze.chat.completions.create({ reasoning_effort: "on", messages: [{ role: "user", content: "x" }] });
    expect(calls[0]!.body!["reasoning_effort"]).toBe("on");
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
});

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodResponseFormat } from "../src/index.js";
import { completion, jsonResponse, mockInterfaze } from "./helpers.js";

describe("structured output: parse + zodResponseFormat", () => {
  it("zodResponseFormat builds an auto-parseable json_schema format", () => {
    const rf = zodResponseFormat(z.object({ a: z.string() }), "x");
    expect(rf.type).toBe("json_schema");
    expect((rf as { $brand?: string }).$brand).toBe("auto-parseable-response-format");
  });

  it("parse() validates message.content against the schema and fills message.parsed", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion('{"city":"Tokyo","temp_c":21}')));
    const Weather = z.object({ city: z.string(), temp_c: z.number() });
    const res = await interfaze.chat.completions.parse({
      messages: [{ role: "user", content: "Weather in Tokyo?" }],
      response_format: zodResponseFormat(Weather, "weather"),
    });
    expect(res.choices[0]!.message.parsed).toEqual({ city: "Tokyo", temp_c: 21 });
    // defaults the model and sends the schema as the response_format
    expect(calls[0]!.body!["model"]).toBe("interfaze-beta");
    expect((calls[0]!.body!["response_format"] as { type: string }).type).toBe("json_schema");
  });

  it("parse() injects a <guard> tag when guard codes are set", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion('{"ok":true}')));
    const res = await interfaze.chat.completions.parse({
      guard: ["S1"],
      messages: [{ role: "user", content: "x" }],
      response_format: zodResponseFormat(z.object({ ok: z.boolean() }), "flag"),
    });
    const sys = (calls[0]!.body!["messages"] as Array<{ role: string; content: string }>).find((m) => m.role === "system");
    expect(sys?.content).toContain("<guard>S1</guard>");
    expect(res.choices[0]!.message.parsed).toEqual({ ok: true });
  });
});

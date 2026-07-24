import { describe, expect, it } from "vitest";
import { guardTag } from "../src/guard.js";
import { completion, jsonResponse, mockInterfaze, systemContent } from "./helpers.js";

const basic = completion("Hi!");

describe("guardTag", () => {
  it("serializes a single code", () => {
    expect(guardTag(["ALL"])).toBe("<guard>ALL</guard>");
  });

  it("serializes multiple codes, comma-separated", () => {
    expect(guardTag(["S1", "S12_IMAGE"])).toBe("<guard>S1, S12_IMAGE</guard>");
  });

  it("throws when given an empty list", () => {
    expect(() => guardTag([])).toThrow(/at least one code/);
  });

  it("throws on an invalid code", () => {
    expect(() => guardTag(["NOT_A_CODE" as never])).toThrow(/Invalid guard code/);
  });
});

describe("create() + guard integration", () => {
  it("serializes a single ALL code into the system message", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(basic));
    await interfaze.chat.completions.create({ guard: ["ALL"], messages: [{ role: "user", content: "x" }] });
    expect(systemContent(calls[0]!.body)).toContain("<guard>ALL</guard>");
  });

  it("serializes multiple codes into the system message", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(basic));
    await interfaze.chat.completions.create({
      guard: ["S1", "S12_IMAGE"],
      messages: [{ role: "user", content: "x" }],
    });
    expect(systemContent(calls[0]!.body)).toContain("<guard>S1, S12_IMAGE</guard>");
  });

  it("throws before sending a request when a guard code is invalid", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(basic));
    expect(() =>
      interfaze.chat.completions.create({
        guard: ["NOT_A_CODE" as never],
        messages: [{ role: "user", content: "x" }],
      }),
    ).toThrow(/Invalid guard code/);
    expect(calls).toHaveLength(0);
  });
});

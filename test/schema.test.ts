import { describe, expect, it } from "vitest";
import { emptyTaskSchema, responseFormat } from "../src/index.js";
import { completion, jsonResponse, mockInterfaze } from "./helpers.js";

describe("emptyTaskSchema", () => {
  it("defaults the schema name to empty_schema", () => {
    expect(emptyTaskSchema()).toEqual({
      type: "json_schema",
      json_schema: { name: "empty_schema", schema: {} },
    });
  });

  it("accepts a custom name", () => {
    const schema = emptyTaskSchema("custom");
    expect(schema.json_schema.name).toBe("custom");
  });
});

describe("responseFormat", () => {
  it("passes an object-root schema through unchanged", () => {
    const objSchema = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
    expect(responseFormat(objSchema, "my_schema")).toEqual({
      type: "json_schema",
      json_schema: { name: "my_schema", schema: objSchema },
    });
  });

  it("wraps a non-object root under a `result` property", () => {
    const arraySchema = { type: "array", items: { type: "string" } };
    const rf = responseFormat(arraySchema);
    expect(rf.json_schema.schema).toEqual({
      type: "object",
      properties: { result: arraySchema },
      required: ["result"],
      additionalProperties: false,
    });
  });

  it("defaults the schema name to response", () => {
    expect(responseFormat({ type: "string" }).json_schema.name).toBe("response");
  });
});

describe("schema + create() integration", () => {
  it("an empty `properties` schema does not conflict with `task` — request carries emptyTaskSchema", async () => {
    const taskOcr = completion(JSON.stringify({ name: "ocr", result: { extracted_text: "x" } }));
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(taskOcr));
    await interfaze.chat.completions.create({
      task: "ocr",
      messages: [{ role: "user", content: "x" }],
      response_format: {
        type: "json_schema",
        json_schema: { name: "s", schema: { type: "object", properties: {} } },
      },
    });
    expect(calls[0]!.body!["response_format"]).toEqual(emptyTaskSchema());
  });
});

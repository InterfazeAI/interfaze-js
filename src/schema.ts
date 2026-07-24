import type { ResponseFormatJSONSchema } from "openai/resources/shared";

type JSONSchema = Record<string, unknown>;

/** Empty `response_format` for raw `<task>` runs (avoids the v6 `zodResponseFormat(z.any())` throw). */
export function emptyTaskSchema(name = "empty_schema"): ResponseFormatJSONSchema {
  return { type: "json_schema", json_schema: { name, schema: {} } };
}

/** Build a structured-output `response_format` from a JSON Schema. */
export function responseFormat(schema: JSONSchema, name = "response"): ResponseFormatJSONSchema {
  return { type: "json_schema", json_schema: { name, schema: ensureObjectRoot(schema) } };
}

function ensureObjectRoot(schema: JSONSchema): JSONSchema {
  if (schema && typeof schema === "object" && schema["type"] === "object") return schema;
  return {
    type: "object",
    properties: { result: schema },
    required: ["result"],
    additionalProperties: false,
  };
}

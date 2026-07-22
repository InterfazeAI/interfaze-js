import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  APIError,
  AuthenticationError,
  BadRequestError,
  Interfaze,
  InterfazeError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  inputs,
} from "../src/index.js";
import { ASSETS } from "./assets.js";
import { completion, errorBody, errorResponse, jsonResponse, mockInterfaze } from "./helpers.js";

const STATUS_MAP = [
  {
    status: 400,
    ExcType: BadRequestError,
    body: errorBody(
      "Field 'temperature': Too big: expected number to be <=1",
      "invalid_request_error",
      "invalid_request",
    ),
  },
  {
    status: 401,
    ExcType: AuthenticationError,
    body: errorBody("Invalid API key provided", "authentication_error", "invalid_api_key"),
  },
  {
    status: 403,
    ExcType: PermissionDeniedError,
    body: errorBody("You do not have access to this resource", "permission_error", "forbidden"),
  },
  {
    status: 404,
    ExcType: NotFoundError,
    body: errorBody("The requested model does not exist", "not_found_error", "model_not_found"),
  },
  {
    status: 429,
    ExcType: RateLimitError,
    body: errorBody("Rate limit exceeded, please slow down", "rate_limit_error", "rate_limit_exceeded"),
  },
  {
    status: 500,
    ExcType: InternalServerError,
    body: errorBody("An internal error occurred", "server_error", "internal_error"),
  },
  {
    status: 503,
    ExcType: InternalServerError,
    body: errorBody("The service is temporarily unavailable", "server_error", "service_unavailable"),
  },
];

describe("HTTP status -> error class mapping", () => {
  for (const { status, ExcType, body } of STATUS_MAP) {
    it(`maps ${status} to ${ExcType.name}`, async () => {
      const { interfaze } = mockInterfaze(() => errorResponse(status, body));
      const promise = interfaze.chat.completions.create({ messages: [{ role: "user", content: "x" }] });
      await expect(promise).rejects.toBeInstanceOf(ExcType);
      await expect(promise).rejects.toBeInstanceOf(APIError);
      await expect(promise).rejects.toMatchObject({ status });
    });
  }

  it("a server 400 surfaces the actual error body — callers rely on .code to branch", async () => {
    const body = STATUS_MAP[0]!.body;
    const { interfaze } = mockInterfaze(() => errorResponse(400, body));
    const promise = interfaze.chat.completions.create({ messages: [{ role: "user", content: "x" }] });
    await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    await expect(promise).rejects.toMatchObject({ code: "invalid_request" });
    await expect(promise).rejects.toThrow(/temperature/);
  });
});

describe("task + response_format conflict", () => {
  it("throws InterfazeError before sending a request when task is combined with a non-empty schema", () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion("Hi!")));
    expect(() =>
      interfaze.chat.completions.create({
        task: "ocr",
        messages: [{ role: "user", content: "x" }],
        response_format: {
          type: "json_schema",
          json_schema: { name: "s", schema: { type: "object", properties: { a: { type: "string" } } } },
        },
      }),
    ).toThrow(InterfazeError);
    expect(calls).toHaveLength(0);
  });
});

describe("invalid guard code", () => {
  it("throws InterfazeError before sending a request", () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion("Hi!")));
    expect(() =>
      interfaze.chat.completions.create({
        guard: ["NOT_A_CODE" as never],
        messages: [{ role: "user", content: "x" }],
      }),
    ).toThrow(InterfazeError);
    expect(calls).toHaveLength(0);
  });
});

describe("inputs blacklisted formats", () => {
  it("inputs.image rejects a .gif URL", () => {
    expect(() => inputs.image("https://jigsawstack.com/preview/example.gif")).toThrow(InterfazeError);
  });

  it("inputs.file rejects an explicit image/avif format", () => {
    expect(() => inputs.file(ASSETS.image, { format: "image/avif" })).toThrow(InterfazeError);
  });

  it("inputs.image rejects a data: URI with a blacklisted mime", () => {
    expect(() => inputs.image("data:image/gif;base64,AAAA")).toThrow(InterfazeError);
  });
});

describe("malformed base64 / data URL handling", () => {
  it("does not raise on a data URL with no mime segment", () => {
    expect(inputs.image("data:;base64,YWJj")).toEqual({
      type: "image_url",
      image_url: { url: "data:;base64,YWJj" },
    });
  });

  it("does not raise (and does not validate) a data URL with garbage base64 payload", () => {
    expect(inputs.image("data:image/png;base64,%%%not-base64%%%")).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,%%%not-base64%%%" },
    });
  });
});

describe("missing API key", () => {
  const saved = process.env["INTERFAZE_API_KEY"];
  beforeEach(() => {
    delete process.env["INTERFAZE_API_KEY"];
  });
  afterEach(() => {
    if (saved === undefined) delete process.env["INTERFAZE_API_KEY"];
    else process.env["INTERFAZE_API_KEY"] = saved;
  });

  it("throws InterfazeError naming the environment variable", () => {
    expect(() => new Interfaze({})).toThrow(InterfazeError);
    expect(() => new Interfaze({})).toThrow(/INTERFAZE_API_KEY/);
  });
});

describe("InterfazeError", () => {
  it("forwards an optional cause", () => {
    const cause = new Error("root cause");
    const err = new InterfazeError("wrapped", { cause });
    expect(err.name).toBe("InterfazeError");
    expect(err.cause).toBe(cause);
  });

  it("omits cause when not provided", () => {
    const err = new InterfazeError("plain");
    expect(err.cause).toBeUndefined();
  });
});

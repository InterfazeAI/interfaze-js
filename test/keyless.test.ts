import type { ClientOptions } from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Interfaze, InterfazeError } from "../src/index.js";
import { completion, errorBody, errorResponse, fixture, jsonResponse, mockInterfaze, sseResponse } from "./helpers.js";

type Fetch = NonNullable<ClientOptions["fetch"]>;

const MESSAGES = [{ role: "user" as const, content: "hi" }];
const ENV_KEY = "sk-test-env";
const EXPLICIT_KEY = "sk-test-explicit";
const OPENAI_KEY = "sk-openai-synthetic";
const ADMIN_KEY = "sk-admin-synthetic";
const NEW_KEY = "sk-test-new";
const CALLER_AUTHORIZATION = "Bearer sk-test-caller";
const WHITESPACE_KEY = " \n";
const OPENAI_DEFAULT_MAX_RETRIES = 2;
const WITH_OPTIONS_TIMEOUT_MS = 1000;
const DAILY_LIMIT_RETRY_AFTER = "3600";
const DAILY_LIMIT_BODY = errorBody(
  "Keyless daily limit of 1000 requests reached. Get a free API key at https://interfaze.ai and send it as `Authorization: Bearer YOUR_API_KEY`.",
  "rate_limit_error",
  "keyless_daily_limit_exceeded"
);

describe("keyless credentials", () => {
  beforeEach(() => {
    vi.stubEnv("INTERFAZE_API_KEY", undefined);
    vi.stubEnv("OPENAI_API_KEY", OPENAI_KEY);
    vi.stubEnv("OPENAI_ADMIN_KEY", ADMIN_KEY);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    ["a trimmed explicit key over INTERFAZE_API_KEY", ` ${EXPLICIT_KEY}\n`, ENV_KEY, `Bearer ${EXPLICIT_KEY}`],
    ["INTERFAZE_API_KEY with no explicit key", undefined, ENV_KEY, `Bearer ${ENV_KEY}`],
    ["INTERFAZE_API_KEY with a whitespace-only explicit key", WHITESPACE_KEY, ENV_KEY, `Bearer ${ENV_KEY}`],
    ["no Authorization header with a whitespace-only INTERFAZE_API_KEY", undefined, WHITESPACE_KEY, null],
    ["no Authorization header with no key", undefined, undefined, null],
  ])("sends %s", async (_label, apiKey, envKey, expected) => {
    vi.stubEnv("INTERFAZE_API_KEY", envKey);
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey });
    await interfaze.chat.completions.create({ messages: MESSAGES });

    expect(calls[0]!.headers.get("authorization")).toBe(expected);
  });

  it("passes a key function through without trimming its result", async () => {
    const apiKey = vi.fn(async () => ` ${EXPLICIT_KEY} `);
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey });
    await interfaze.chat.completions.create({ messages: MESSAGES });

    expect(apiKey).toHaveBeenCalledTimes(1);
    expect(calls[0]!.headers.get("authorization")).toBe(`Bearer  ${EXPLICIT_KEY}`);
  });

  it("sends a caller Authorization header as is with no key", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), {
      apiKey: undefined,
      defaultHeaders: { Authorization: CALLER_AUTHORIZATION },
    });
    await interfaze.chat.completions.create({ messages: MESSAGES });

    expect(calls[0]!.headers.get("authorization")).toBe(CALLER_AUTHORIZATION);
  });

  it("never sends OPENAI_ADMIN_KEY", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse({ object: "list", data: [] }), { apiKey: undefined });
    await interfaze.openai.admin.organization.certificates.list().catch(() => undefined);

    expect(calls.map((call) => call.headers.get("authorization"))).not.toContain(`Bearer ${ADMIN_KEY}`);
  });

  it("streams with no Authorization header when no key is set", async () => {
    const { interfaze, calls } = mockInterfaze(() => sseResponse(fixture<unknown[]>("stream_basic.json")), { apiKey: undefined });
    const final = await interfaze.chat.completions.stream({ messages: MESSAGES }).finalChatCompletion();

    expect(final.choices[0]!.message.content).toBe("1\n2\n3\n4\n5");
    expect(calls[0]!.headers.has("authorization")).toBe(false);
  });

  it.each([
    ["sends a new key", { apiKey: NEW_KEY }, `Bearer ${NEW_KEY}`],
    ["stays keyless", { timeout: WITH_OPTIONS_TIMEOUT_MS }, null],
    ["stays keyless with an empty key", { apiKey: "" }, null],
    ["stays keyless with a whitespace-only key", { apiKey: " " }, null],
  ])("%s through withOptions on a keyless client", async (_label, options, expected) => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey: undefined });
    await interfaze.openai.withOptions(options).chat.completions.create({ model: "interfaze-beta", messages: MESSAGES });

    expect(calls[0]!.headers.get("authorization")).toBe(expected);
  });

  it.each([
    ["no Authorization header from a keyless client", undefined, null],
    ["the key from a keyed client", EXPLICIT_KEY, `Bearer ${EXPLICIT_KEY}`],
  ])("sends %s through withOptions with a new fetch", async (_label, apiKey, expected) => {
    const fetch = vi.fn<Fetch>(async () => jsonResponse(completion()));
    const { interfaze } = mockInterfaze(() => jsonResponse(completion()), { apiKey });
    await interfaze.openai.withOptions({ fetch }).chat.completions.create({ model: "interfaze-beta", messages: MESSAGES });

    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get("authorization")).toBe(expected);
  });

  it("stops after one request on a 429 with x-should-retry: false", async () => {
    const { interfaze, calls } = mockInterfaze(
      () => errorResponse(429, DAILY_LIMIT_BODY, { "retry-after": DAILY_LIMIT_RETRY_AFTER, "x-should-retry": "false" }),
      { apiKey: undefined, maxRetries: OPENAI_DEFAULT_MAX_RETRIES }
    );

    await expect(interfaze.chat.completions.create({ messages: MESSAGES })).rejects.toMatchObject({
      status: 429,
      code: "keyless_daily_limit_exceeded",
    });
    expect(calls).toHaveLength(1);
  });

  describe("browser guard", () => {
    it.each([
      ["no key, with dangerouslyAllowBrowser", { dangerouslyAllowBrowser: true }],
      ["a blank caller Authorization header", { defaultHeaders: { authorization: " " } }],
    ])("throws InterfazeError for %s when a document exists", (_label, options) => {
      vi.stubGlobal("document", {});

      expect(() => new Interfaze(options)).toThrow(InterfazeError);
    });

    it.each([
      ["an explicit key", { apiKey: EXPLICIT_KEY }],
      ["a caller Authorization header", { defaultHeaders: { Authorization: CALLER_AUTHORIZATION } }],
    ])("builds a client with %s when a document exists", (_label, options) => {
      vi.stubGlobal("document", {});

      expect(() => new Interfaze(options)).not.toThrow();
    });

    it("throws InterfazeError with no key when importScripts exists", () => {
      vi.stubGlobal("importScripts", () => {});

      expect(() => new Interfaze()).toThrow(InterfazeError);
    });

    it("stays keyless in a runtime that defines WorkerGlobalScope but not importScripts", async () => {
      vi.stubGlobal("WorkerGlobalScope", class {});
      vi.stubGlobal("ServiceWorkerGlobalScope", class {});
      const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey: undefined });
      await interfaze.chat.completions.create({ messages: MESSAGES });

      expect(calls[0]!.headers.has("authorization")).toBe(false);
    });

    it("sends the key when importScripts exists", async () => {
      vi.stubGlobal("importScripts", () => {});
      const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey: EXPLICIT_KEY });
      await interfaze.chat.completions.create({ messages: MESSAGES });

      expect(calls[0]!.headers.get("authorization")).toBe(`Bearer ${EXPLICIT_KEY}`);
    });
  });
});

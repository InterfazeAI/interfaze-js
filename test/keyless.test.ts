import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationError, Interfaze, InterfazeError, OpenAIError, RateLimitError } from "../src/index.js";
import {
  DAILY_LIMIT_BODY,
  INFLIGHT_BODY,
  SIGNUP_HINT,
  UNAUTHORIZED_BODY,
  completion,
  dailyLimitResponse,
  errorResponse,
  fixture,
  inflightResponse,
  jsonResponse,
  mockInterfaze,
  sseResponse,
} from "./helpers.js";

const MESSAGES = [{ role: "user" as const, content: "hi" }];
const ENV_KEY = "sk-test-env";
const EXPLICIT_KEY = "sk-test-explicit";
const OPENAI_KEY = "sk-openai-synthetic";
const ADMIN_KEY = "sk-admin-synthetic";
const NEW_KEY = "sk-test-new";
const CALLER_AUTHORIZATION = "Bearer sk-test-caller";
const REQUEST_AUTHORIZATION = "Bearer sk-test-request";
const WHITESPACE_KEY = " \n";
const DEFAULT_MAX_RETRIES = 2;
const FAST_RETRY_AFTER = "0.001";
const RETRIED_ATTEMPTS = 2;
const FAST_LIMIT_MS = 2000;
const WITH_OPTIONS_TIMEOUT_MS = 1000;

describe("keyless credentials", () => {
  beforeEach(() => {
    vi.stubEnv("INTERFAZE_API_KEY", undefined);
    vi.stubEnv("OPENAI_API_KEY", undefined);
    vi.stubEnv("OPENAI_ADMIN_KEY", undefined);
    vi.stubEnv("OPENAI_CUSTOM_HEADERS", undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends a chat request with no Authorization header when no key is set", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey: undefined });
    await interfaze.chat.completions.create({ messages: MESSAGES });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers.has("authorization")).toBe(false);
  });

  it("does not send OPENAI_API_KEY when no Interfaze key is set", async () => {
    vi.stubEnv("OPENAI_API_KEY", OPENAI_KEY);
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey: undefined });
    await interfaze.chat.completions.create({ messages: MESSAGES });

    expect(calls[0]!.headers.has("authorization")).toBe(false);
  });

  it("streams with no Authorization header when no key is set", async () => {
    const { interfaze, calls } = mockInterfaze(() => sseResponse(fixture<unknown[]>("stream_basic.json")), { apiKey: undefined });
    const final = await interfaze.chat.completions.stream({ messages: MESSAGES }).finalChatCompletion();

    expect(final.choices[0]!.message.content).toBe("1\n2\n3\n4\n5");
    expect(calls[0]!.headers.has("authorization")).toBe(false);
  });

  it("lists models with no Authorization header when no key is set", async () => {
    const models = { object: "list", data: [{ id: "interfaze-beta", object: "model", created: 0, owned_by: "interfaze" }] };
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(models), { apiKey: undefined });
    const page = await interfaze.models.list();

    expect(page.data.map((m) => m.id)).toEqual(["interfaze-beta"]);
    expect(calls[0]!.headers.has("authorization")).toBe(false);
  });

  it.each([
    ["chat", (i: Interfaze) => i.openai.chat.completions.create({ model: "interfaze-beta", messages: MESSAGES })],
    [
      "structured output",
      (i: Interfaze) =>
        i.openai.chat.completions.create({
          model: "interfaze-beta",
          messages: MESSAGES,
          response_format: { type: "json_schema", json_schema: { name: "answer", schema: { type: "object" } } },
        }),
    ],
    ["models", (i: Interfaze) => i.openai.models.list()],
    ["embeddings", (i: Interfaze) => i.openai.embeddings.create({ model: "interfaze-beta", input: "hi", encoding_format: "float" })],
    ["moderations", (i: Interfaze) => i.openai.moderations.create({ input: "hi" })],
    ["batches", (i: Interfaze) => i.openai.batches.list()],
  ])("sends %s on the raw openai client with no Authorization header", async (_label, send) => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse({ ...completion(), object: "list", data: [] }), { apiKey: undefined });
    await send(interfaze);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers.has("authorization")).toBe(false);
  });

  it.each([
    ["no key", undefined],
    ["a key", EXPLICIT_KEY],
  ])("never sends OPENAI_ADMIN_KEY with %s", async (_label, apiKey) => {
    vi.stubEnv("OPENAI_ADMIN_KEY", ADMIN_KEY);
    const { interfaze, calls } = mockInterfaze(() => jsonResponse({ object: "list", data: [] }), { apiKey });
    await interfaze.openai.admin.organization.certificates.list().catch(() => undefined);

    expect(calls.map((call) => call.headers.get("authorization"))).not.toContain(`Bearer ${ADMIN_KEY}`);
  });

  it.each([
    ["an empty explicit key", { apiKey: "" }, undefined],
    ["a whitespace-only explicit key", { apiKey: " " }, undefined],
    ["a newline-only explicit key", { apiKey: WHITESPACE_KEY }, undefined],
    ["a whitespace-only INTERFAZE_API_KEY", { apiKey: undefined }, WHITESPACE_KEY],
    ["an empty INTERFAZE_API_KEY", { apiKey: undefined }, ""],
  ])("treats %s as no key", async (_label, options, envValue) => {
    vi.stubEnv("INTERFAZE_API_KEY", envValue);
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), options);
    await interfaze.chat.completions.create({ messages: MESSAGES });

    expect(calls[0]!.headers.has("authorization")).toBe(false);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["a space", " "],
    ["whitespace-only", WHITESPACE_KEY],
  ])("sends INTERFAZE_API_KEY as a bearer token when the explicit key is %s", async (_label, apiKey) => {
    vi.stubEnv("INTERFAZE_API_KEY", ENV_KEY);
    vi.stubEnv("OPENAI_API_KEY", OPENAI_KEY);
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey });
    await interfaze.chat.completions.create({ messages: MESSAGES });

    expect(calls[0]!.headers.get("authorization")).toBe(`Bearer ${ENV_KEY}`);
  });

  it("sends an explicit key instead of INTERFAZE_API_KEY", async () => {
    vi.stubEnv("INTERFAZE_API_KEY", ENV_KEY);
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey: EXPLICIT_KEY });
    await interfaze.chat.completions.create({ messages: MESSAGES });

    expect(calls[0]!.headers.get("authorization")).toBe(`Bearer ${EXPLICIT_KEY}`);
  });

  it("trims an explicit key", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey: ` ${EXPLICIT_KEY}\n` });
    await interfaze.chat.completions.create({ messages: MESSAGES });

    expect(calls[0]!.headers.get("authorization")).toBe(`Bearer ${EXPLICIT_KEY}`);
  });

  it("passes a key function through without trimming its result", async () => {
    const apiKey = vi.fn(async () => ` ${EXPLICIT_KEY} `);
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey });
    await interfaze.chat.completions.create({ messages: MESSAGES });

    expect(apiKey).toHaveBeenCalledTimes(1);
    expect(calls[0]!.headers.get("authorization")).toBe(`Bearer  ${EXPLICIT_KEY}`);
  });

  describe("withOptions", () => {
    it("sends a new key given to withOptions on a keyless client", async () => {
      const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey: undefined });
      await interfaze.openai.withOptions({ apiKey: NEW_KEY }).chat.completions.create({ model: "interfaze-beta", messages: MESSAGES });

      expect(calls[0]!.headers.get("authorization")).toBe(`Bearer ${NEW_KEY}`);
    });

    it("keeps a keyless client keyless through withOptions", async () => {
      const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey: undefined });
      await interfaze.openai
        .withOptions({ timeout: WITH_OPTIONS_TIMEOUT_MS })
        .chat.completions.create({ model: "interfaze-beta", messages: MESSAGES });

      expect(calls[0]!.headers.has("authorization")).toBe(false);
    });

    it("sends a new key given to withOptions on a keyed client", async () => {
      const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey: EXPLICIT_KEY });
      await interfaze.openai.withOptions({ apiKey: NEW_KEY }).chat.completions.create({ model: "interfaze-beta", messages: MESSAGES });

      expect(calls[0]!.headers.get("authorization")).toBe(`Bearer ${NEW_KEY}`);
    });
  });

  describe("OPENAI_CUSTOM_HEADERS", () => {
    it.each([
      ["Authorization", `Authorization: Bearer ${OPENAI_KEY}\nx-team: platform`],
      ["a lower-case authorization", `x-team: platform\nauthorization: Bearer ${OPENAI_KEY}`],
    ])("does not send %s from the env to Interfaze when no key is set", async (_label, custom) => {
      vi.stubEnv("OPENAI_CUSTOM_HEADERS", custom);
      const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey: undefined });
      await interfaze.chat.completions.create({ messages: MESSAGES });

      expect(calls[0]!.headers.has("authorization")).toBe(false);
    });

    it("sends the Interfaze key instead of an Authorization line from the env", async () => {
      vi.stubEnv("OPENAI_CUSTOM_HEADERS", `Authorization: Bearer ${OPENAI_KEY}`);
      const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey: EXPLICIT_KEY });
      await interfaze.chat.completions.create({ messages: MESSAGES });

      expect(calls[0]!.headers.get("authorization")).toBe(`Bearer ${EXPLICIT_KEY}`);
    });

    it("sends a caller Authorization header instead of an Authorization line from the env", async () => {
      vi.stubEnv("OPENAI_CUSTOM_HEADERS", `Authorization: Bearer ${OPENAI_KEY}`);
      const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), {
        apiKey: undefined,
        defaultHeaders: { Authorization: CALLER_AUTHORIZATION },
      });
      await interfaze.chat.completions.create({ messages: MESSAGES });

      expect(calls[0]!.headers.get("authorization")).toBe(CALLER_AUTHORIZATION);
    });
  });

  describe("a caller Authorization header", () => {
    it.each([["Authorization"], ["authorization"], ["AUTHORIZATION"]])("is sent as is with no key (default header %s)", async (name) => {
      const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), {
        apiKey: undefined,
        defaultHeaders: { [name]: CALLER_AUTHORIZATION },
      });
      await interfaze.chat.completions.create({ messages: MESSAGES });

      expect(calls[0]!.headers.get("authorization")).toBe(CALLER_AUTHORIZATION);
    });

    it("is sent once, instead of the key, when a key is also set", async () => {
      const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), {
        apiKey: EXPLICIT_KEY,
        defaultHeaders: { authorization: CALLER_AUTHORIZATION },
      });
      await interfaze.chat.completions.create({ messages: MESSAGES });

      expect(calls[0]!.headers.get("authorization")).toBe(CALLER_AUTHORIZATION);
    });

    it.each([
      ["no key", undefined],
      ["a key", EXPLICIT_KEY],
    ])("is sent as a per-request header with %s", async (_label, apiKey) => {
      const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey });
      await interfaze.chat.completions.create({ messages: MESSAGES }, { headers: { authorization: REQUEST_AUTHORIZATION } });

      expect(calls[0]!.headers.get("authorization")).toBe(REQUEST_AUTHORIZATION);
    });

    it("is sent through the raw client with no key", async () => {
      const { interfaze, calls } = mockInterfaze(() => jsonResponse({ object: "list", data: [] }), {
        apiKey: undefined,
        defaultHeaders: { Authorization: CALLER_AUTHORIZATION },
      });
      await interfaze.openai.models.list();

      expect(calls[0]!.headers.get("authorization")).toBe(CALLER_AUTHORIZATION);
    });
  });

  describe("errors and retries", () => {
    it.each([
      ["keyless", undefined],
      ["keyed", EXPLICIT_KEY],
    ])("rejects a 401 for a %s client after one request with the default retries", async (_label, apiKey) => {
      const { interfaze, calls } = mockInterfaze(() => errorResponse(401, UNAUTHORIZED_BODY), { apiKey, maxRetries: DEFAULT_MAX_RETRIES });
      const promise = interfaze.chat.completions.create({ messages: MESSAGES });

      await expect(promise).rejects.toBeInstanceOf(AuthenticationError);
      await expect(promise).rejects.toMatchObject({ status: 401, code: "insufficient_quota", error: UNAUTHORIZED_BODY });
      expect(calls).toHaveLength(1);
    });

    it("rejects a keyless daily-limit 429 after one request, without waiting for Retry-After", async () => {
      const { interfaze, calls } = mockInterfaze(() => dailyLimitResponse(), { apiKey: undefined, maxRetries: DEFAULT_MAX_RETRIES });
      const started = Date.now();
      const promise = interfaze.chat.completions.create({ messages: MESSAGES });

      await expect(promise).rejects.toBeInstanceOf(RateLimitError);
      await expect(promise).rejects.toMatchObject({ status: 429, code: "keyless_daily_limit_exceeded", error: DAILY_LIMIT_BODY });
      await expect(promise).rejects.toThrow(SIGNUP_HINT);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.headers.has("authorization")).toBe(false);
      expect(Date.now() - started).toBeLessThan(FAST_LIMIT_MS);
    });

    it("keeps the rate-limit headers on a keyless daily-limit 429", async () => {
      const { interfaze } = mockInterfaze(() => dailyLimitResponse(), { apiKey: undefined, maxRetries: DEFAULT_MAX_RETRIES });
      const error = await interfaze.chat.completions.create({ messages: MESSAGES }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RateLimitError);
      const headers = (error as RateLimitError).headers;
      expect(headers.get("retry-after")).toBe("3600");
      expect(headers.get("x-ratelimit-remaining")).toBe("0");
      expect(headers.get("x-ratelimit-limit")).toBe("1000");
    });

    it("stops after one request on a daily-limit 429 from a stream", async () => {
      const { interfaze, calls } = mockInterfaze(() => dailyLimitResponse(), { apiKey: undefined, maxRetries: DEFAULT_MAX_RETRIES });
      const started = Date.now();
      const promise = interfaze.chat.completions.stream({ messages: MESSAGES }).finalChatCompletion();

      await expect(promise).rejects.toMatchObject({ status: 429, code: "keyless_daily_limit_exceeded" });
      expect(calls).toHaveLength(1);
      expect(Date.now() - started).toBeLessThan(FAST_LIMIT_MS);
    });

    it("composes with a caller fetch that returns the daily-limit 429", async () => {
      const callerFetch = vi.fn<typeof fetch>(async () => dailyLimitResponse());
      const interfaze = new Interfaze({ fetch: callerFetch, maxRetries: DEFAULT_MAX_RETRIES });
      const promise = interfaze.chat.completions.create({ messages: MESSAGES });

      await expect(promise).rejects.toMatchObject({ status: 429, code: "keyless_daily_limit_exceeded" });
      expect(callerFetch).toHaveBeenCalledTimes(1);
    });

    it("keeps the status of a 429 whose body is not JSON", async () => {
      const callerFetch = vi.fn<typeof fetch>(async () => new Response("slow down", { status: 429 }));
      const interfaze = new Interfaze({ fetch: callerFetch, maxRetries: 0 });

      await expect(interfaze.chat.completions.create({ messages: MESSAGES })).rejects.toMatchObject({ status: 429 });
      expect(callerFetch).toHaveBeenCalledTimes(1);
    });

    it("retries a 429 whose JSON body is not an error object", async () => {
      const callerFetch = vi.fn<typeof fetch>(async () => errorResponse(429, "plain text error", { "retry-after": FAST_RETRY_AFTER }));
      const interfaze = new Interfaze({ fetch: callerFetch, maxRetries: 1 });

      await expect(interfaze.chat.completions.create({ messages: MESSAGES })).rejects.toMatchObject({ status: 429 });
      expect(callerFetch).toHaveBeenCalledTimes(RETRIED_ATTEMPTS);
    });

    it("still retries a keyless in-flight 429", async () => {
      const responses = [() => inflightResponse(FAST_RETRY_AFTER), () => jsonResponse(completion())];
      const { interfaze, calls } = mockInterfaze(() => responses[calls.length - 1]!(), { apiKey: undefined, maxRetries: DEFAULT_MAX_RETRIES });
      const result = await interfaze.chat.completions.create({ messages: MESSAGES });

      expect(result.choices[0]!.message.content).toBe("Hi!");
      expect(calls).toHaveLength(RETRIED_ATTEMPTS);
    });

    it("surfaces a keyless in-flight 429 with its status, code and hint after the retries", async () => {
      const { interfaze, calls } = mockInterfaze(() => inflightResponse(FAST_RETRY_AFTER), { apiKey: undefined, maxRetries: 1 });
      const promise = interfaze.chat.completions.create({ messages: MESSAGES });

      await expect(promise).rejects.toMatchObject({ status: 429, code: "keyless_inflight_limit_exceeded", error: INFLIGHT_BODY });
      await expect(promise).rejects.toThrow(SIGNUP_HINT);
      expect(calls).toHaveLength(RETRIED_ATTEMPTS);
    });
  });

  describe("browser guard", () => {
    it("keeps the openai browser guard for a client with no key", () => {
      vi.stubGlobal("window", { document: {} });
      vi.stubGlobal("navigator", {});

      expect(() => new Interfaze()).toThrow(OpenAIError);
      expect(() => new Interfaze()).toThrow(/browser-like environment/);
    });

    it.each([
      ["a process polyfill", {}],
      ["dangerouslyAllowBrowser", { dangerouslyAllowBrowser: true }],
    ])("throws InterfazeError with no key when a document exists (%s)", (_label, options) => {
      vi.stubGlobal("document", {});
      vi.stubGlobal("process", { env: {} });
      const fetchImpl = vi.fn<typeof fetch>();

      expect(() => new Interfaze({ ...options, fetch: fetchImpl })).toThrow(InterfazeError);
      expect(() => new Interfaze({ ...options, fetch: fetchImpl })).toThrow(/API key/);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("throws InterfazeError for a blank key when a document exists", () => {
      vi.stubGlobal("document", {});

      expect(() => new Interfaze({ apiKey: " " })).toThrow(InterfazeError);
    });

    it("builds a client with an explicit key when a document exists", () => {
      vi.stubGlobal("document", {});

      expect(() => new Interfaze({ apiKey: EXPLICIT_KEY })).not.toThrow();
    });

    it("builds a client with an INTERFAZE_API_KEY env key when a document exists", () => {
      vi.stubGlobal("document", {});
      vi.stubEnv("INTERFAZE_API_KEY", ENV_KEY);

      expect(() => new Interfaze()).not.toThrow();
    });

    it("builds a client with a caller Authorization header when a document exists", () => {
      vi.stubGlobal("document", {});

      expect(() => new Interfaze({ defaultHeaders: { authorization: CALLER_AUTHORIZATION } })).not.toThrow();
    });

    it("stays keyless in a runtime with no process and no document", async () => {
      vi.stubGlobal("process", undefined);
      try {
        const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), { apiKey: undefined });
        await interfaze.chat.completions.create({ messages: MESSAGES });

        expect(calls).toHaveLength(1);
        expect(calls[0]!.headers.has("authorization")).toBe(false);
      } finally {
        // The afterEach hook reads process.env, so restore process first.
        vi.unstubAllGlobals();
      }
    });
  });
});

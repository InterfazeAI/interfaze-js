import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationError, Interfaze, OpenAIError, RateLimitError, type InterfazeOptions } from "../src/index.js";
import { completion, errorBody, errorResponse, fixture, jsonResponse, mockInterfaze, sseResponse } from "./helpers.js";

const MESSAGES = [{ role: "user" as const, content: "hi" }];
const ENV_KEY = "sk-env-synthetic";
const EXPLICIT_KEY = "sk-explicit-synthetic";
const OPENAI_KEY = "sk-openai-synthetic";
const DEFAULT_MAX_RETRIES = 2;

describe("credentials", () => {
  beforeEach(() => {
    vi.stubEnv("INTERFAZE_API_KEY", undefined);
    vi.stubEnv("OPENAI_API_KEY", undefined);
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
    ["an empty explicit key", { apiKey: "" }, undefined],
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

  it("rejects a 401 for a bad key without a keyless retry", async () => {
    const body = errorBody("Invalid API key provided", "authentication_error", "invalid_api_key");
    const { interfaze, calls } = mockInterfaze(() => errorResponse(401, body), { apiKey: EXPLICIT_KEY, maxRetries: DEFAULT_MAX_RETRIES });
    const promise = interfaze.chat.completions.create({ messages: MESSAGES });

    await expect(promise).rejects.toBeInstanceOf(AuthenticationError);
    await expect(promise).rejects.toMatchObject({ status: 401, code: "invalid_api_key", error: body });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers.get("authorization")).toBe(`Bearer ${EXPLICIT_KEY}`);
  });

  it("surfaces a keyless 429 with its status, code and guidance", async () => {
    const guidance = "Get a free API key at https://interfaze.ai to continue.";
    const body = errorBody(`Keyless request limit reached. ${guidance}`, "rate_limit_error", "rate_limit_exceeded");
    const { interfaze, calls } = mockInterfaze(() => errorResponse(429, body), { apiKey: undefined });
    const promise = interfaze.chat.completions.create({ messages: MESSAGES });

    await expect(promise).rejects.toBeInstanceOf(RateLimitError);
    await expect(promise).rejects.toMatchObject({ status: 429, code: "rate_limit_exceeded", error: body });
    await expect(promise).rejects.toThrow(guidance);
    expect(calls[0]!.headers.has("authorization")).toBe(false);
  });

  it("keeps the browser guard for a client with no key", () => {
    vi.stubGlobal("window", { document: {} });
    vi.stubGlobal("navigator", {});

    expect(() => new Interfaze()).toThrow(OpenAIError);
    expect(() => new Interfaze()).toThrow(/browser-like environment/);
  });
});

describe("client construction", () => {
  it("exposes only the curated surface (no 404-prone resources)", () => {
    const i = new Interfaze({ apiKey: "sk-test" }) as unknown as Record<string, unknown>;
    expect(i["chat"]).toBeDefined();
    expect(i["models"]).toBeDefined();
    expect(i["tasks"]).toBeDefined();
    expect(i["embeddings"]).toBeUndefined();
    expect(i["responses"]).toBeUndefined();
    expect(i["audio"]).toBeUndefined();
    expect(i["images"]).toBeUndefined();
    expect(i["batches"]).toBeUndefined();
  });

  it("still exposes the raw OpenAI client as an escape hatch", () => {
    const i = new Interfaze({ apiKey: "sk-test" });
    expect(i.openai).toBeDefined();
    expect(i.openai.chat.completions).toBeDefined();
  });

  it("defaults the timeout above the server's 800s cap", () => {
    const i = new Interfaze({ apiKey: "sk-test" });
    expect((i.openai as unknown as { timeout: number }).timeout).toBe(900_000);
  });

  it("respects an explicit timeout", () => {
    const i = new Interfaze({ apiKey: "sk-test", timeout: 30_000 });
    expect((i.openai as unknown as { timeout: number }).timeout).toBe(30_000);
  });
});

describe("defaultHeaders", () => {
  it.each([
    ["a plain object", { "x-trace": "abc" }],
    ["a Headers instance", new Headers({ "x-trace": "abc" })],
    ["an array of tuples", [["x-trace", "abc"]]],
  ])("forwards headers given as %s", async (_label, defaultHeaders) => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(completion()), {
      defaultHeaders: defaultHeaders as InterfazeOptions["defaultHeaders"],
      bypassCache: true,
    });
    await interfaze.chat.completions.create({ messages: [{ role: "user", content: "hi" }] });

    expect(calls[0]!.headers.get("x-trace")).toBe("abc");
    expect(calls[0]!.headers.get("x-interfaze-bypass-cache")).toBe("true");
  });
});

import OpenAI from "openai";
import type { ClientOptions } from "openai";

import { InterfazeChat } from "./chat.js";
import { DEFAULT_TIMEOUT_MS, HEADERS, INTERFAZE_BASE_URL } from "./constants.js";
import { InterfazeError } from "./errors.js";
import { Tasks } from "./tasks.js";

/** Options for constructing an {@link Interfaze} client; extends the OpenAI `ClientOptions`. */
export interface InterfazeOptions extends ClientOptions {
  /** Emit `<precontext>` deltas while streaming (`x-show-additional-info`). */
  showAdditionalInfo?: boolean;
  /** Skip the mixture-of-architecture tool router (`x-interfaze-bypass-moa`). */
  bypassMoA?: boolean;
  /** Skip the semantic cache (`x-interfaze-bypass-cache`). */
  bypassCache?: boolean;
  /** Admin key that surfaces a `debug` field (`x-admin-key`). */
  adminKey?: string;
}

/**
 * `defaultHeaders` is openai's `HeadersLike`, so it may be a `Headers` instance or an
 * array of tuples. Spreading either gives `{}` or `{"0": [name, value]}`, which silently
 * drops every header the caller set.
 */
function headerRecord(given: ClientOptions["defaultHeaders"]): Record<string, unknown> {
  if (!given) return {};
  if ((typeof Headers !== "undefined" && given instanceof Headers) || Array.isArray(given)) {
    const out: Record<string, string> = {};
    new Headers(given as HeadersInit).forEach((value, name) => (out[name] = value));
    return out;
  }
  return { ...given };
}

/** Reads an environment variable. A runtime without `process` has no environment to read. */
function envVar(name: string): string | undefined {
  return typeof process !== "undefined" && process.env ? process.env[name] : undefined;
}

/** The openai client rejects an empty key and otherwise reads OPENAI_API_KEY, so a keyless client passes this stand-in. */
const KEYLESS_STAND_IN_KEY = "interfaze-keyless";
const STAND_IN_AUTHORIZATION = `Bearer ${KEYLESS_STAND_IN_KEY}`;
/** The `error.code` of the keyless daily-limit 429. */
const DAILY_LIMIT_CODE = "keyless_daily_limit_exceeded";
const HTTP_TOO_MANY_REQUESTS = 429;
const MISSING_KEY_MESSAGE = "Interfaze does not accept keyless requests from a browser. Pass an API key: `new Interfaze({ apiKey })`.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** True for a parsed 429 body that carries the keyless daily-limit code. */
function isDailyLimitBody(value: unknown): boolean {
  return isRecord(value) && isRecord(value["error"]) && value["error"]["code"] === DAILY_LIMIT_CODE;
}

/** True when the caller's default headers carry a non-empty `Authorization` value. */
function hasAuthorization(headers: Record<string, unknown>): boolean {
  return Object.entries(headers).some(
    ([name, value]) => name.trim().toLowerCase() === "authorization" && typeof value === "string" && value.trim() !== ""
  );
}

/**
 * Marks the keyless daily-limit 429 as not retryable. The openai client sleeps for the full
 * `Retry-After` (until the next UTC midnight) before it retries, and `timeout` does not cover that sleep.
 */
async function stopRetryOnDailyLimit(response: Response): Promise<Response> {
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => undefined);
  if (!isDailyLimitBody(body)) return response;
  const headers = new Headers(response.headers);
  headers.set("x-should-retry", "false");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Wraps `fetch` for a client that can be keyless. The wrapper removes the stand-in `Authorization` value
 * and stops the retry of a keyless daily-limit 429.
 */
function wrapFetch(inner: ClientOptions["fetch"]): NonNullable<ClientOptions["fetch"]> {
  return async (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (headers.get("authorization") === STAND_IN_AUTHORIZATION) headers.delete("authorization");
    const response = await (inner ?? globalThis.fetch)(input, { ...init, headers });
    return response.status === HTTP_TOO_MANY_REQUESTS ? stopRetryOnDailyLimit(response) : response;
  };
}

/** Interfaze API client — an OpenAI-compatible client wired to the Interfaze endpoint. */
export class Interfaze {
  readonly openai: OpenAI;
  readonly chat: InterfazeChat;
  readonly models: OpenAI["models"];
  readonly tasks: Tasks;

  constructor(options: InterfazeOptions = {}) {
    const { showAdditionalInfo, bypassMoA, bypassCache, adminKey, apiKey, baseURL, defaultHeaders, fetch: callerFetch, ...rest } = options;

    const explicitKey = typeof apiKey === "string" ? apiKey.trim() : apiKey;
    const resolvedKey = explicitKey || envVar("INTERFAZE_API_KEY")?.trim();
    const callerHeaders = headerRecord(defaultHeaders);
    const callerAuthorization = hasAuthorization(callerHeaders);
    // A browser cannot hide a key and the API rejects keyless browser requests, so a keyless client fails before any request.
    if (!resolvedKey && !callerAuthorization && "document" in globalThis) throw new InterfazeError(MISSING_KEY_MESSAGE);

    const headers = callerHeaders as Record<string, string | null>;
    if (showAdditionalInfo) headers[HEADERS.showAdditionalInfo] = "true";
    if (bypassMoA) headers[HEADERS.bypassMoA] = "true";
    if (bypassCache) headers[HEADERS.bypassCache] = "true";
    if (adminKey) headers[HEADERS.adminKey] = adminKey;

    this.openai = new OpenAI({
      ...rest,
      apiKey: resolvedKey || KEYLESS_STAND_IN_KEY,
      // Left undefined, this falls back to OPENAI_ADMIN_KEY, and the openai client would send that key to Interfaze.
      adminAPIKey: rest.adminAPIKey ?? null,
      baseURL: baseURL ?? INTERFAZE_BASE_URL,
      defaultHeaders: headers,
      fetch: wrapFetch(callerFetch),
      timeout: rest.timeout ?? DEFAULT_TIMEOUT_MS,
    });

    this.chat = new InterfazeChat(this.openai);
    this.models = this.openai.models;
    this.tasks = new Tasks(this.chat.completions);
  }
}

export default Interfaze;

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
const MISSING_KEY_MESSAGE = "Interfaze does not accept keyless requests from a browser. Pass an API key: `new Interfaze({ apiKey })`.";

/** True when the caller's default headers carry a non-empty `Authorization` value. */
function hasAuthorization(headers: Record<string, unknown>): boolean {
  return Object.entries(headers).some(([name, value]) => name.toLowerCase() === "authorization" && typeof value === "string" && value.trim() !== "");
}

/** An OpenAI client that sends no `Authorization` header while its key is the stand-in, also after `withOptions`. */
class InterfazeOpenAI extends OpenAI {
  override withOptions(options: Partial<ClientOptions>): this {
    const { apiKey } = options;
    return super.withOptions(typeof apiKey === "string" ? { ...options, apiKey: apiKey.trim() || KEYLESS_STAND_IN_KEY } : options);
  }

  protected override async bearerAuth(...args: Parameters<OpenAI["bearerAuth"]>) {
    return this.apiKey === KEYLESS_STAND_IN_KEY ? undefined : super.bearerAuth(...args);
  }

  protected override validateHeaders(...args: Parameters<OpenAI["validateHeaders"]>) {
    if (this.apiKey !== KEYLESS_STAND_IN_KEY) super.validateHeaders(...args);
  }
}

/** Interfaze API client — an OpenAI-compatible client wired to the Interfaze endpoint. */
export class Interfaze {
  readonly openai: OpenAI;
  readonly chat: InterfazeChat;
  readonly models: OpenAI["models"];
  readonly tasks: Tasks;

  constructor(options: InterfazeOptions = {}) {
    const { showAdditionalInfo, bypassMoA, bypassCache, adminKey, apiKey, baseURL, defaultHeaders, ...rest } = options;

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

    this.openai = new InterfazeOpenAI({
      ...rest,
      apiKey: resolvedKey || KEYLESS_STAND_IN_KEY,
      // Left undefined, this falls back to OPENAI_ADMIN_KEY, and the openai client would send that key to Interfaze.
      adminAPIKey: rest.adminAPIKey ?? null,
      baseURL: baseURL ?? INTERFAZE_BASE_URL,
      defaultHeaders: headers,
      timeout: rest.timeout ?? DEFAULT_TIMEOUT_MS,
    });

    this.chat = new InterfazeChat(this.openai);
    this.models = this.openai.models;
    this.tasks = new Tasks(this.chat.completions);
  }
}

export default Interfaze;

import OpenAI from "openai";
import type { ClientOptions } from "openai";

import { InterfazeChat } from "./chat.js";
import { DEFAULT_TIMEOUT_MS, HEADERS, INTERFAZE_BASE_URL } from "./constants.js";
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

function envKey(): string | undefined {
  return typeof process !== "undefined" && process.env ? process.env["INTERFAZE_API_KEY"] : undefined;
}

/**
 * The openai client refuses to construct without a credential, and otherwise reads OPENAI_API_KEY.
 * A client with no key passes this stand-in together with a null `Authorization` default header,
 * which tells the openai client to omit the header, so the stand-in never leaves the process.
 */
const KEYLESS_STAND_IN_KEY = "interfaze-keyless";

/** Interfaze API client — an OpenAI-compatible client wired to the Interfaze endpoint. */
export class Interfaze {
  readonly openai: OpenAI;
  readonly chat: InterfazeChat;
  readonly models: OpenAI["models"];
  readonly tasks: Tasks;

  constructor(options: InterfazeOptions = {}) {
    const { showAdditionalInfo, bypassMoA, bypassCache, adminKey, apiKey, baseURL, defaultHeaders, ...rest } = options;

    const resolvedKey = apiKey || envKey();
    const keylessHeaders = resolvedKey ? {} : { Authorization: null };

    const headers = { ...keylessHeaders, ...headerRecord(defaultHeaders) } as Record<string, string | null>;
    if (showAdditionalInfo) headers[HEADERS.showAdditionalInfo] = "true";
    if (bypassMoA) headers[HEADERS.bypassMoA] = "true";
    if (bypassCache) headers[HEADERS.bypassCache] = "true";
    if (adminKey) headers[HEADERS.adminKey] = adminKey;

    this.openai = new OpenAI({
      ...rest,
      apiKey: resolvedKey || KEYLESS_STAND_IN_KEY,
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

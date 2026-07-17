import OpenAI from "openai";
import type { ClientOptions } from "openai";

import { InterfazeChat } from "./chat.js";
import { HEADERS, INTERFAZE_BASE_URL } from "./constants.js";
import { InterfazeError } from "./errors.js";
import { Tasks } from "./tasks.js";

export interface InterfazeOptions extends ClientOptions {
  /** Emit `<precontext>` deltas while streaming (`x-show-additional-info`). */
  showAdditionalInfo?: boolean;
  /** Skip the mixture-of-experts tool router (`x-bypass-moe`). */
  bypassMoe?: boolean;
  /** Skip the semantic cache (`x-bypass-cache`). */
  bypassCache?: boolean;
  /** Admin key that surfaces a `debug` field (`x-admin-key`). */
  adminKey?: string;
}

function envKey(): string | undefined {
  return typeof process !== "undefined" && process.env ? process.env["INTERFAZE_API_KEY"] : undefined;
}

/**
 * The Interfaze client — a curated wrapper over the OpenAI SDK. Exposes the endpoints Interfaze
 * implements (`chat.completions`, `models`) plus task helpers (`tasks.*`); unsupported OpenAI
 * resources are intentionally absent.
 */
export class Interfaze {
  /** The underlying OpenAI client (escape hatch). */
  readonly openai: OpenAI;
  readonly chat: InterfazeChat;
  readonly models: OpenAI["models"];
  readonly tasks: Tasks;

  constructor(options: InterfazeOptions = {}) {
    const { showAdditionalInfo, bypassMoe, bypassCache, adminKey, apiKey, baseURL, defaultHeaders, ...rest } = options;

    const resolvedKey = apiKey ?? envKey();
    if (!resolvedKey) {
      throw new InterfazeError(
        "Missing API key. Pass `new Interfaze({ apiKey })` or set the INTERFAZE_API_KEY environment variable.",
      );
    }

    const headers: Record<string, string> = { ...(defaultHeaders as Record<string, string> | undefined) };
    if (showAdditionalInfo) headers[HEADERS.showAdditionalInfo] = "true";
    if (bypassMoe) headers[HEADERS.bypassMoe] = "true";
    if (bypassCache) headers[HEADERS.bypassCache] = "true";
    if (adminKey) headers[HEADERS.adminKey] = adminKey;

    this.openai = new OpenAI({
      ...rest,
      apiKey: resolvedKey,
      baseURL: baseURL ?? INTERFAZE_BASE_URL,
      defaultHeaders: headers,
    });

    this.chat = new InterfazeChat(this.openai);
    this.models = this.openai.models;
    this.tasks = new Tasks(this.chat.completions);
  }
}

export default Interfaze;

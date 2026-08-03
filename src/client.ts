import type { ClientOptions } from "./_compat.js";
import { Client } from "./_compat.js";

import { InterfazeChat } from "./chat.js";
import { DEFAULT_TIMEOUT_MS, HEADERS, INTERFAZE_BASE_URL } from "./constants.js";
import { InterfazeError } from "./errors.js";
import { Tasks } from "./tasks.js";

export interface InterfazeOptions extends ClientOptions {
  /** Emit `<precontext>` deltas while streaming (`x-show-additional-info`). */
  showAdditionalInfo?: boolean;
  /** Skip the mixture-of-agents tool router (`x-interfaze-bypass-moa`). */
  bypassMoA?: boolean;
  /** Skip the semantic cache (`x-interfaze-bypass-cache`). */
  bypassCache?: boolean;
  /** Admin key that surfaces a `debug` field (`x-admin-key`). */
  adminKey?: string;
}

function envKey(): string | undefined {
  return typeof process !== "undefined" && process.env ? process.env["INTERFAZE_API_KEY"] : undefined;
}

export class Interfaze {
  readonly openai: Client;
  readonly chat: InterfazeChat;
  readonly models: Client["models"];
  readonly tasks: Tasks;

  constructor(options: InterfazeOptions = {}) {
    const { showAdditionalInfo, bypassMoA, bypassCache, adminKey, apiKey, baseURL, defaultHeaders, ...rest } = options;

    const resolvedKey = apiKey ?? envKey();
    if (!resolvedKey) {
      throw new InterfazeError("Missing API key. Pass `new Interfaze({ apiKey })` or set the INTERFAZE_API_KEY environment variable.");
    }

    const headers: Record<string, string> = { ...(defaultHeaders as Record<string, string> | undefined) };
    if (showAdditionalInfo) headers[HEADERS.showAdditionalInfo] = "true";
    if (bypassMoA) headers[HEADERS.bypassMoA] = "true";
    if (bypassCache) headers[HEADERS.bypassCache] = "true";
    if (adminKey) headers[HEADERS.adminKey] = adminKey;

    this.openai = new Client({
      ...rest,
      apiKey: resolvedKey,
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

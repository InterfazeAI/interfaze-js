import { describe, it } from "vitest";
import type { ClientOptions as OpenAIClientOptions } from "openai";
import type { ChatCompletionCreateParamsBase as OpenAIChatCompletionCreateParamsBase } from "openai/resources/chat/completions/completions";
import type { ChatCompletionCreateParamsNonStreaming, ClientOptions } from "../src/_compat.js";

// The hand-mirrored types in src/_compat.ts must expose at least every key the
// real openai types do, or consumers hit excess-property errors on valid params.
// These compile-time assertions fail `npm run typecheck` when openai adds a field
// the mirror is missing, turning silent drift into a build failure.
type AssertKeysCovered<Real, Mirror> = keyof Real extends keyof Mirror ? true : ["missing keys", Exclude<keyof Real, keyof Mirror>];

const _clientOptionsCovered: AssertKeysCovered<OpenAIClientOptions, ClientOptions> = true;
const _createParamsCovered: AssertKeysCovered<OpenAIChatCompletionCreateParamsBase, ChatCompletionCreateParamsNonStreaming> = true;

void _clientOptionsCovered;
void _createParamsCovered;

describe("compat types stay in sync with openai", () => {
  it("mirrors every openai ClientOptions and chat-create key (enforced at typecheck)", () => {});
});

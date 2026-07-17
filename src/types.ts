import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions/completions";
import type { TASK_NAMES, GUARD_CODES } from "./constants.js";

export type TaskName = (typeof TASK_NAMES)[number];
export type GuardCode = (typeof GUARD_CODES)[number];

/** Wider than the OpenAI enum — Interfaze also accepts `on`/`off`/`auto`. */
export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "on" | "off" | "auto";

/** One internal task's raw output, surfaced in `response.precontext`. */
export interface Precontext {
  name: string;
  result: unknown;
}

/** A chat completion plus the fields Interfaze adds. */
export interface InterfazeChatCompletion extends ChatCompletion {
  /** Present when internal tools ran (OCR / web search / scrape / STT / forecast / …). */
  precontext?: Precontext[];
  /** Reasoning text — present with `reasoning_effort: "high"` and no schema. */
  reasoning?: string;
  /** Whether the semantic cache was hit. */
  vcache: boolean;
  /** Admin-only debug payload (requires `adminKey`). */
  debug?: unknown;
}

interface InterfazeExtraParams {
  /** Defaults to `"interfaze-beta"`. */
  model?: string;
  reasoning_effort?: ReasoningEffort | null;
  /** Force a single task; serialized to a `<task>…</task>` message. Not combinable with a non-empty `response_format`. */
  task?: TaskName;
  /** Enable guardrail categories; serialized to a `<guard>…</guard>` message. */
  guard?: GuardCode[];
}

export type InterfazeChatCompletionCreateParamsNonStreaming = Omit<
  ChatCompletionCreateParamsNonStreaming,
  "reasoning_effort" | "model"
> &
  InterfazeExtraParams & { stream?: false | null };

export type InterfazeChatCompletionCreateParamsStreaming = Omit<
  ChatCompletionCreateParamsStreaming,
  "reasoning_effort" | "model"
> &
  InterfazeExtraParams & { stream: true };

export type InterfazeChatCompletionCreateParams =
  | InterfazeChatCompletionCreateParamsNonStreaming
  | InterfazeChatCompletionCreateParamsStreaming;

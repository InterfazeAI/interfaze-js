export { Interfaze, Interfaze as default } from "./client.js";
export type { InterfazeOptions } from "./client.js";

export { InterfazeError } from "./errors.js";
export { InterfazeChatCompletionStream } from "./stream.js";
export { responseFormat, emptyTaskSchema } from "./schema.js";

/** Content-part + input builders (`inputs.image/file/audio/video/dataUrl/fromPath/autoPart`). */
export * as inputs from "./inputs.js";

export type {
  TaskName,
  GuardCode,
  ReasoningEffort,
  Precontext,
  InterfazeChatCompletion,
  InterfazeChatCompletionCreateParams,
  InterfazeChatCompletionCreateParamsNonStreaming,
  InterfazeChatCompletionCreateParamsStreaming,
} from "./types.js";

export {
  TASK_NAMES,
  GUARD_CODES,
  GUARD_LABELS,
  INTERFAZE_MODEL,
  INTERFAZE_BASE_URL,
  LIMITS,
} from "./constants.js";

// OpenAI re-exports (so users don't need a direct `openai` import).
export { toFile } from "openai";
export {
  OpenAIError,
  APIError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  BadRequestError,
  AuthenticationError,
  InternalServerError,
  PermissionDeniedError,
  UnprocessableEntityError,
} from "openai";
export type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionChunk,
  ChatCompletionMessage,
  ChatCompletionContentPart,
} from "openai/resources/chat/completions/completions";

// Chat-Completions-only compatibility layer

import _Client, {
  OpenAIError as _OpenAIError,
  APIError as _APIError,
  APIConnectionError as _APIConnectionError,
  APIConnectionTimeoutError as _APIConnectionTimeoutError,
  APIUserAbortError as _APIUserAbortError,
  BadRequestError as _BadRequestError,
  AuthenticationError as _AuthenticationError,
  PermissionDeniedError as _PermissionDeniedError,
  NotFoundError as _NotFoundError,
  ConflictError as _ConflictError,
  UnprocessableEntityError as _UnprocessableEntityError,
  RateLimitError as _RateLimitError,
  InternalServerError as _InternalServerError,
  toFile as _toFile,
} from "openai";
import { zodResponseFormat as _zodResponseFormat } from "openai/helpers/zod";

interface Ctor<T> {
  new (...args: any[]): T;
  readonly prototype: T;
}

// Errors

export interface OpenAIError extends Error {}
export const OpenAIError = _OpenAIError as unknown as Ctor<OpenAIError>;

export interface APIError extends OpenAIError {
  readonly status: number | undefined;
  readonly headers?: Headers | undefined;
  readonly error?: unknown;
  readonly code: string | null | undefined;
  readonly param: string | null | undefined;
  readonly type: string | undefined;
  readonly requestID?: string | null | undefined;
}
export const APIError = _APIError as unknown as Ctor<APIError>;

export interface APIConnectionError extends APIError {}
export const APIConnectionError = _APIConnectionError as unknown as Ctor<APIConnectionError>;

export interface APIConnectionTimeoutError extends APIConnectionError {}
export const APIConnectionTimeoutError = _APIConnectionTimeoutError as unknown as Ctor<APIConnectionTimeoutError>;

export interface APIUserAbortError extends APIError {}
export const APIUserAbortError = _APIUserAbortError as unknown as Ctor<APIUserAbortError>;

export interface BadRequestError extends APIError {}
export const BadRequestError = _BadRequestError as unknown as Ctor<BadRequestError>;

export interface AuthenticationError extends APIError {}
export const AuthenticationError = _AuthenticationError as unknown as Ctor<AuthenticationError>;

export interface PermissionDeniedError extends APIError {}
export const PermissionDeniedError = _PermissionDeniedError as unknown as Ctor<PermissionDeniedError>;

export interface NotFoundError extends APIError {}
export const NotFoundError = _NotFoundError as unknown as Ctor<NotFoundError>;

export interface ConflictError extends APIError {}
export const ConflictError = _ConflictError as unknown as Ctor<ConflictError>;

export interface UnprocessableEntityError extends APIError {}
export const UnprocessableEntityError = _UnprocessableEntityError as unknown as Ctor<UnprocessableEntityError>;

export interface RateLimitError extends APIError {}
export const RateLimitError = _RateLimitError as unknown as Ctor<RateLimitError>;

export interface InternalServerError extends APIError {}
export const InternalServerError = _InternalServerError as unknown as Ctor<InternalServerError>;

export const toFile = _toFile as unknown as (value: any, name?: string, options?: { type?: string }) => Promise<unknown>;

// Shared value types

export type FunctionParameters = Record<string, unknown>;

export interface FunctionDefinition {
  name: string;
  description?: string;
  parameters?: FunctionParameters;
  strict?: boolean | null;
}

export type Metadata = Record<string, string>;

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null;

export interface ResponseFormatText {
  type: "text";
}

export interface ResponseFormatJSONObject {
  type: "json_object";
}

export interface ResponseFormatJSONSchema {
  type: "json_schema";
  json_schema: {
    name: string;
    description?: string;
    schema?: Record<string, unknown>;
    strict?: boolean | null;
  };
}

export type ResponseFormat = ResponseFormatText | ResponseFormatJSONObject | ResponseFormatJSONSchema;

// Content parts

export interface ChatCompletionContentPartText {
  type: "text";
  text: string;
}

export interface ChatCompletionContentPartImage {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

export interface ChatCompletionContentPartInputAudio {
  type: "input_audio";
  input_audio: {
    data: string;
    format: "wav" | "mp3";
  };
}

export interface ChatCompletionContentPartFile {
  type: "file";
  file: {
    file_data?: string;
    file_id?: string;
    filename?: string;
  };
}

export type ChatCompletionContentPart =
  ChatCompletionContentPartText | ChatCompletionContentPartImage | ChatCompletionContentPartInputAudio | ChatCompletionContentPartFile;

// Tools

export interface ChatCompletionTool {
  type: "function";
  function: FunctionDefinition;
}

export interface ChatCompletionNamedToolChoice {
  type: "function";
  function: { name: string };
}

export type ChatCompletionToolChoiceOption = "none" | "auto" | "required" | ChatCompletionNamedToolChoice;

export interface ChatCompletionMessageToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

// Message params (request side)

export interface ChatCompletionSystemMessageParam {
  role: "system";
  content: string | Array<ChatCompletionContentPartText>;
  name?: string;
}

export interface ChatCompletionUserMessageParam {
  role: "user";
  content: string | Array<ChatCompletionContentPart>;
  name?: string;
}

export interface ChatCompletionAssistantMessageParam {
  role: "assistant";
  content?: string | Array<ChatCompletionContentPartText> | null;
  name?: string;
  refusal?: string | null;
  tool_calls?: Array<ChatCompletionMessageToolCall>;
}

export interface ChatCompletionToolMessageParam {
  role: "tool";
  content: string | Array<ChatCompletionContentPartText>;
  tool_call_id: string;
}

export interface ChatCompletionFunctionMessageParam {
  role: "function";
  content: string | null;
  name: string;
}

export type ChatCompletionMessageParam =
  | ChatCompletionSystemMessageParam
  | ChatCompletionUserMessageParam
  | ChatCompletionAssistantMessageParam
  | ChatCompletionToolMessageParam
  | ChatCompletionFunctionMessageParam;

// Message (response side)

export interface ChatCompletionMessageAnnotation {
  type: "url_citation";
  url_citation: {
    end_index: number;
    start_index: number;
    title: string;
    url: string;
  };
}

export interface ChatCompletionMessage {
  role: "assistant";
  content: string | null;
  refusal?: string | null;
  tool_calls?: Array<ChatCompletionMessageToolCall>;
  annotations?: Array<ChatCompletionMessageAnnotation>;
}

export interface ChatCompletionTopLogprob {
  token: string;
  bytes: Array<number> | null;
  logprob: number;
}

export interface ChatCompletionTokenLogprob extends ChatCompletionTopLogprob {
  top_logprobs: Array<ChatCompletionTopLogprob>;
}

export interface ChatCompletionChoiceLogprobs {
  content: Array<ChatCompletionTokenLogprob> | null;
  refusal: Array<ChatCompletionTokenLogprob> | null;
}

export interface ChatCompletionUsage {
  completion_tokens: number;
  prompt_tokens: number;
  total_tokens: number;
  completion_tokens_details?: {
    accepted_prediction_tokens?: number;
    audio_tokens?: number;
    reasoning_tokens?: number;
    rejected_prediction_tokens?: number;
  };
  prompt_tokens_details?: {
    audio_tokens?: number;
    cache_write_tokens?: number;
    cached_tokens?: number;
  };
}

export type ChatCompletionFinishReason = "stop" | "length" | "tool_calls" | "content_filter" | "function_call";

export interface ChatCompletionChoice {
  finish_reason: ChatCompletionFinishReason;
  index: number;
  logprobs: ChatCompletionChoiceLogprobs | null;
  message: ChatCompletionMessage;
}

export interface ChatCompletion {
  id: string;
  choices: Array<ChatCompletionChoice>;
  created: number;
  model: string;
  object: "chat.completion";
  service_tier?: "auto" | "default" | "flex" | "scale" | "priority" | null;
  system_fingerprint?: string;
  usage?: ChatCompletionUsage;
}

// Streaming chunk

export interface ChatCompletionChunkDeltaToolCall {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface ChatCompletionChunkDelta {
  content?: string | null;
  refusal?: string | null;
  role?: "developer" | "system" | "user" | "assistant" | "tool";
  tool_calls?: Array<ChatCompletionChunkDeltaToolCall>;
}

export interface ChatCompletionChunkChoice {
  delta: ChatCompletionChunkDelta;
  finish_reason: ChatCompletionFinishReason | null;
  index: number;
  logprobs?: ChatCompletionChoiceLogprobs | null;
}

export interface ChatCompletionChunk {
  id: string;
  choices: Array<ChatCompletionChunkChoice>;
  created: number;
  model: string;
  object: "chat.completion.chunk";
  service_tier?: "auto" | "default" | "flex" | "scale" | "priority" | null;
  system_fingerprint?: string;
  usage?: ChatCompletionUsage | null;
}

// Create params

export interface ChatCompletionStreamOptions {
  include_obfuscation?: boolean;
  include_usage?: boolean;
}

interface ChatCompletionCreateParamsBase {
  messages: Array<ChatCompletionMessageParam>;
  model: string;
  temperature?: number | null;
  top_p?: number | null;
  max_tokens?: number | null;
  max_completion_tokens?: number | null;
  n?: number | null;
  stop?: string | null | Array<string>;
  stream?: boolean | null;
  stream_options?: ChatCompletionStreamOptions | null;
  presence_penalty?: number | null;
  frequency_penalty?: number | null;
  logit_bias?: Record<string, number> | null;
  logprobs?: boolean | null;
  top_logprobs?: number | null;
  seed?: number | null;
  tools?: Array<ChatCompletionTool>;
  tool_choice?: ChatCompletionToolChoiceOption;
  response_format?: ResponseFormat;
  reasoning_effort?: ReasoningEffort;
  user?: string;
  metadata?: Metadata | null;
}

export interface ChatCompletionCreateParamsNonStreaming extends ChatCompletionCreateParamsBase {
  stream?: false | null;
}

export interface ChatCompletionCreateParamsStreaming extends ChatCompletionCreateParamsBase {
  stream: true;
}

export type ChatCompletionCreateParams = ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming;

// Core plumbing: APIPromise / Stream / RequestOptions / ClientOptions

export type APIPromise<T> = Promise<T> & {
  asResponse(): Promise<Response>;
  withResponse(): Promise<{ data: T; response: Response }>;
  _thenUnwrap<U>(fn: (value: T) => U): APIPromise<U>;
};

export interface Stream<T> extends AsyncIterable<T> {
  controller?: AbortController;
  [Symbol.asyncIterator](): AsyncIterator<T>;
}

export interface RequestOptions {
  headers?: Headers | Record<string, string | null | undefined> | undefined;
  signal?: AbortSignal | null | undefined;
  timeout?: number;
  maxRetries?: number;
  query?: Record<string, unknown> | undefined | null;
  body?: unknown;
  idempotencyKey?: string;
}

export interface ClientOptions {
  apiKey?: string;
  baseURL?: string | null;
  timeout?: number;
  maxRetries?: number;
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  defaultHeaders?: Headers | Record<string, string | null | undefined>;
  defaultQuery?: Record<string, string | undefined>;
  dangerouslyAllowBrowser?: boolean;
}

// Client

export interface Model {
  id: string;
  created: number;
  object: "model";
  owned_by: string;
}

export interface ModelDeleted {
  id: string;
  deleted: boolean;
  object: string;
}

export interface ModelsPage {
  object: "list";
  data: Array<Model>;
}

export interface Models {
  list(options?: RequestOptions): APIPromise<ModelsPage>;
  retrieve(model: string, options?: RequestOptions): APIPromise<Model>;
  delete(model: string, options?: RequestOptions): APIPromise<ModelDeleted>;
}

// Structured-output parsing (`parse()` + `zodResponseFormat`)

type ZodTypeLike = ({ _output: unknown } | { _zod: { output: unknown } }) & {
  parse?: (data: unknown) => unknown;
};
type InferZodType<T extends ZodTypeLike> = T extends { _output: infer O } ? O : T extends { _zod: { output: infer O } } ? O : never;

export interface AutoParseableResponseFormat<T> extends ResponseFormatJSONSchema {
  $brand: "auto-parseable-response-format";
  $parseRaw(content: string): T;
}

export const zodResponseFormat = _zodResponseFormat as unknown as <ZodInput extends ZodTypeLike>(
  schema: ZodInput,
  name: string,
  props?: { description?: string }
) => AutoParseableResponseFormat<InferZodType<ZodInput>>;

export interface ParsedChatCompletionMessage<T> extends ChatCompletionMessage {
  parsed: T | null;
}
export interface ParsedChoice<T> extends Omit<ChatCompletionChoice, "message"> {
  message: ParsedChatCompletionMessage<T>;
}
export interface ParsedChatCompletion<T> extends Omit<ChatCompletion, "choices"> {
  choices: Array<ParsedChoice<T>>;
}

export interface ChatCompletions {
  create(body: ChatCompletionCreateParamsNonStreaming, options?: RequestOptions): APIPromise<ChatCompletion>;
  create(body: ChatCompletionCreateParamsStreaming, options?: RequestOptions): APIPromise<Stream<ChatCompletionChunk>>;
  parse<T>(
    body: { response_format: AutoParseableResponseFormat<T> } & Record<string, unknown>,
    options?: RequestOptions
  ): APIPromise<ParsedChatCompletion<T>>;
}

export interface Client {
  chat: { completions: ChatCompletions };
  models: Models;
}

export const Client = _Client as unknown as Ctor<Client>;

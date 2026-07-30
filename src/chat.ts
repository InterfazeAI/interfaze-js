import type {
  APIPromise,
  AutoParseableResponseFormat,
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  Client,
  ParsedChatCompletion,
  RequestOptions,
  Stream,
} from "./_compat.js";

import { INTERFAZE_MODEL } from "./constants.js";
import { InterfazeError } from "./errors.js";
import { guardTag } from "./guard.js";
import { emptyTaskSchema } from "./schema.js";
import { InterfazeChatCompletionStream, stripJsonFence } from "./stream.js";
import type {
  GuardCode,
  InterfazeChatCompletion,
  InterfazeChatCompletionCreateParams,
  InterfazeChatCompletionCreateParamsNonStreaming,
  InterfazeChatCompletionCreateParamsStreaming,
} from "./types.js";

export function toInterfaze(raw: ChatCompletion, opts: { stripFence: boolean }): InterfazeChatCompletion {
  const r = raw as InterfazeChatCompletion;
  r.vcache = (raw as { vcache?: boolean }).vcache ?? false;
  if (opts.stripFence) {
    const msg = r.choices?.[0]?.message;
    if (msg && typeof msg.content === "string") msg.content = stripJsonFence(msg.content);
  }
  return r;
}

function injectTags(messages: readonly ChatCompletionMessageParam[], task?: string, guard?: string): ChatCompletionMessageParam[] {
  const tags = [task, guard].filter(Boolean).join(" ");
  if (!tags) return messages.slice();
  const out = messages.slice();
  const idx = out.findIndex((m) => m.role === "system");
  const first = idx === -1 ? undefined : out[idx];
  if (first && first.role === "system" && typeof first.content === "string") {
    out[idx] = {
      role: "system",
      content: first.content ? `${tags}\n${first.content}` : tags,
      ...(first.name ? { name: first.name } : {}),
    };
    return out;
  }
  return [{ role: "system", content: tags }, ...out];
}

function isNonEmptySchema(rf: unknown): boolean {
  const schema = (rf as { json_schema?: { schema?: { properties?: Record<string, unknown> } } })?.json_schema?.schema;
  return !!schema?.properties && Object.keys(schema.properties).length > 0;
}

function prepare(params: InterfazeChatCompletionCreateParams): {
  body: Record<string, unknown>;
  stripFence: boolean;
} {
  const { task, guard, model, messages, response_format, ...rest } = params as InterfazeChatCompletionCreateParams & {
    response_format?: unknown;
  };

  let rf = response_format;
  if (task) {
    if (rf && isNonEmptySchema(rf)) {
      throw new InterfazeError("A non-empty `response_format` cannot be combined with `task` (Interfaze runs tasks with raw output).");
    }
    rf = emptyTaskSchema();
  }

  const body: Record<string, unknown> = {
    ...rest,
    model: model ?? INTERFAZE_MODEL,
    messages: injectTags(
      messages as ChatCompletionMessageParam[],
      task ? `<task>${task}</task>` : undefined,
      guard?.length ? guardTag(guard) : undefined
    ),
  };
  if (rf !== undefined) body["response_format"] = rf;

  return { body, stripFence: (rf as { type?: string })?.type === "json_object" };
}

export type InterfazeChatCompletionParseParams<T> = Omit<InterfazeChatCompletionCreateParamsNonStreaming, "response_format" | "task"> & {
  response_format: AutoParseableResponseFormat<T>;
  guard?: GuardCode[];
};

export class InterfazeCompletions {
  #client: Client;
  constructor(client: Client) {
    this.#client = client;
  }

  create(params: InterfazeChatCompletionCreateParamsNonStreaming, options?: RequestOptions): APIPromise<InterfazeChatCompletion>;
  create(params: InterfazeChatCompletionCreateParamsStreaming, options?: RequestOptions): APIPromise<Stream<ChatCompletionChunk>>;
  create(
    params: InterfazeChatCompletionCreateParams,
    options?: RequestOptions
  ): APIPromise<InterfazeChatCompletion> | APIPromise<Stream<ChatCompletionChunk>> {
    const { body, stripFence } = prepare(params);
    const raw = this.#client.chat.completions.create(body as never, options);
    if (params.stream) {
      return raw as unknown as APIPromise<Stream<ChatCompletionChunk>>;
    }
    return (raw as unknown as APIPromise<ChatCompletion>)._thenUnwrap((c) => toInterfaze(c, { stripFence }));
  }

  /** Structured output: parses `message.content` against the schema and returns it on `message.parsed`. */
  parse<T>(params: InterfazeChatCompletionParseParams<T>, options?: RequestOptions): APIPromise<ParsedChatCompletion<T>> {
    const { guard, model, messages, ...rest } = params;
    const body = {
      ...rest,
      model: model ?? INTERFAZE_MODEL,
      messages: injectTags(messages as ChatCompletionMessageParam[], undefined, guard?.length ? guardTag(guard) : undefined),
    };
    return this.#client.chat.completions.parse<T>(body as never, options);
  }

  /** Streaming with an Interfaze-tolerant accumulator; also surfaces `<think>`/`<precontext>`. */
  stream(params: Omit<InterfazeChatCompletionCreateParamsStreaming, "stream">, options?: RequestOptions): InterfazeChatCompletionStream {
    const { body, stripFence } = prepare({ ...params, stream: true } as InterfazeChatCompletionCreateParamsStreaming);
    return new InterfazeChatCompletionStream(this.#client, body, options, stripFence);
  }
}

export class InterfazeChat {
  completions: InterfazeCompletions;
  constructor(client: Client) {
    this.completions = new InterfazeCompletions(client);
  }
}

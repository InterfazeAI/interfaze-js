import type OpenAI from "openai";
import type { ChatCompletionChunk } from "openai/resources/chat/completions/completions";

import { InterfazeError } from "./errors.js";
import type { InterfazeChatCompletion, Precontext } from "./types.js";

type RequestOptions = OpenAI.RequestOptions;

interface ToolCallAcc {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Streaming helper that folds the raw `create({stream:true})` iterable itself — the OpenAI
 * `ChatCompletionStream` accumulator throws `missing role for choice 0` on Interfaze's role-less
 * deltas. Extracts the conditional `<think>` / `<precontext>` side-channels (either may be absent).
 */
export class InterfazeChatCompletionStream implements AsyncIterable<ChatCompletionChunk> {
  #openai: OpenAI;
  #body: Record<string, unknown>;
  #options: RequestOptions | undefined;
  #stripFence: boolean;

  #started = false;
  #done = false;
  #raw?: Promise<AsyncIterable<ChatCompletionChunk>>;

  #content = "";
  #role: string | undefined;
  #finishReason: string | null = null;
  #id = "";
  #model = "";
  #created = 0;
  #toolCalls = new Map<number, ToolCallAcc>();

  constructor(openai: OpenAI, body: Record<string, unknown>, options?: RequestOptions, stripFence = false) {
    this.#openai = openai;
    this.#body = body;
    this.#options = options;
    this.#stripFence = stripFence;
  }

  #getRaw(): Promise<AsyncIterable<ChatCompletionChunk>> {
    if (!this.#raw) {
      this.#raw = this.#openai.chat.completions.create(
        { ...this.#body, stream: true } as never,
        this.#options,
      ) as unknown as Promise<AsyncIterable<ChatCompletionChunk>>;
    }
    return this.#raw;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<ChatCompletionChunk> {
    if (this.#started) throw new InterfazeError("This stream has already been consumed.");
    this.#started = true;
    const raw = await this.#getRaw();
    for await (const chunk of raw) {
      this.#accumulate(chunk);
      yield chunk;
    }
    this.#done = true;
  }

  /**
   * Yield visible text only, stripping `<think>`/`<precontext>` across chunk boundaries.
   * Use this (not the raw chunk iterator) for live rendering; `reasoning`/`precontext`
   * remain available on `finalChatCompletion()`.
   */
  async *textDeltas(): AsyncGenerator<string> {
    if (this.#started) throw new InterfazeError("This stream has already been consumed.");
    this.#started = true;
    const filter = new SideChannelFilter();
    const raw = await this.#getRaw();
    for await (const chunk of raw) {
      this.#accumulate(chunk);
      const piece = chunk.choices?.[0]?.delta?.content;
      if (typeof piece === "string" && piece) {
        const visible = filter.feed(piece);
        if (visible) yield visible;
      }
    }
    const tail = filter.flush();
    if (tail) yield tail;
    this.#done = true;
  }

  #accumulate(chunk: ChatCompletionChunk): void {
    if (!this.#id && chunk.id) this.#id = chunk.id;
    if (!this.#model && chunk.model) this.#model = chunk.model;
    if (!this.#created && chunk.created) this.#created = chunk.created;
    const choice = chunk.choices?.[0];
    if (!choice) return;
    const delta = choice.delta;
    if (delta?.role) this.#role = delta.role;
    if (typeof delta?.content === "string") this.#content += delta.content;
    if (choice.finish_reason) this.#finishReason = choice.finish_reason;
    for (const tc of delta?.tool_calls ?? []) {
      const acc = this.#toolCalls.get(tc.index) ?? { id: "", name: "", arguments: "" };
      if (tc.id) acc.id = tc.id;
      if (tc.function?.name) acc.name = tc.function.name;
      if (tc.function?.arguments) acc.arguments += tc.function.arguments;
      this.#toolCalls.set(tc.index, acc);
    }
  }

  /** Concatenated visible content (side-channel blocks removed). */
  get text(): string {
    return stripSideChannels(this.#content).text;
  }

  /** Drive the stream to completion (if not already) and return the assembled completion. */
  async finalChatCompletion(): Promise<InterfazeChatCompletion> {
    if (!this.#started) {
      this.#started = true;
      const raw = await this.#getRaw();
      for await (const chunk of raw) this.#accumulate(chunk);
      this.#done = true;
    } else if (!this.#done) {
      throw new InterfazeError("Call finalChatCompletion() after fully iterating the stream, or instead of iterating.");
    }
    return this.#build();
  }

  #build(): InterfazeChatCompletion {
    const { text: rawText, reasoning, precontext } = stripSideChannels(this.#content);
    const text = this.#stripFence ? stripJsonFence(rawText) : rawText;
    const toolCalls = [...this.#toolCalls.values()].map((t) => ({
      id: t.id,
      type: "function" as const,
      function: { name: t.name, arguments: t.arguments },
    }));
    const message = {
      role: (this.#role as "assistant") ?? "assistant",
      content: toolCalls.length ? null : text,
      refusal: null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
    const completion = {
      id: this.#id,
      object: "chat.completion",
      created: this.#created,
      model: this.#model,
      choices: [{ index: 0, message, finish_reason: (this.#finishReason ?? "stop") as "stop", logprobs: null }],
      vcache: false,
    } as unknown as InterfazeChatCompletion;
    if (reasoning) completion.reasoning = reasoning;
    if (precontext) completion.precontext = precontext;
    return completion;
  }
}

const TAG_RE = (tag: string) => new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");

/** Pull `<think>`/`<precontext>` blocks out of streamed content; returns the rest as `text`. */
export function stripSideChannels(content: string): {
  text: string;
  reasoning?: string;
  precontext?: Precontext[];
} {
  let text = content;
  const thinks: string[] = [];
  text = text.replace(TAG_RE("think"), (_m, inner: string) => {
    thinks.push(inner.trim());
    return "";
  });
  const pre: Precontext[] = [];
  text = text.replace(TAG_RE("precontext"), (_m, inner: string) => {
    try {
      const parsed = JSON.parse(inner.trim());
      if (Array.isArray(parsed)) pre.push(...parsed);
      else pre.push(parsed);
    } catch {
      /* ignore malformed block */
    }
    return "";
  });
  const out: { text: string; reasoning?: string; precontext?: Precontext[] } = { text: text.trim() };
  if (thinks.length) out.reasoning = thinks.join("\n");
  if (pre.length) out.precontext = pre;
  return out;
}

/** Interfaze returns `json_object` content wrapped in a ```json fence; unwrap it. */
export function stripJsonFence(content: string): string {
  const t = content.trim();
  if (!t.startsWith("```")) return content;
  return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

const SIDE_OPEN = ["<think>", "<precontext>"] as const;
const SIDE_CLOSE: Record<string, string> = { "<think>": "</think>", "<precontext>": "</precontext>" };

function suffixPrefixLen(s: string, tag: string): number {
  for (let k = Math.min(s.length, tag.length - 1); k > 0; k--) {
    if (s.slice(s.length - k) === tag.slice(0, k)) return k;
  }
  return 0;
}

/** Strips inline `<think>`/`<precontext>` blocks from streamed content, chunk by chunk. */
class SideChannelFilter {
  #buf = "";
  #close: string | undefined;

  feed(text: string): string {
    this.#buf += text;
    const out: string[] = [];
    while (this.#buf) {
      if (this.#close === undefined) {
        const lt = this.#buf.indexOf("<");
        if (lt === -1) {
          out.push(this.#buf);
          this.#buf = "";
          break;
        }
        if (lt > 0) {
          out.push(this.#buf.slice(0, lt));
          this.#buf = this.#buf.slice(lt);
        }
        const opened = SIDE_OPEN.find((t) => this.#buf.startsWith(t));
        if (opened) {
          this.#close = SIDE_CLOSE[opened];
          this.#buf = this.#buf.slice(opened.length);
          continue;
        }
        if (SIDE_OPEN.some((t) => t.startsWith(this.#buf))) break;
        out.push("<");
        this.#buf = this.#buf.slice(1);
      } else {
        const close = this.#close;
        const end = this.#buf.indexOf(close);
        if (end === -1) {
          const keep = suffixPrefixLen(this.#buf, close);
          this.#buf = keep ? this.#buf.slice(this.#buf.length - keep) : "";
          break;
        }
        this.#buf = this.#buf.slice(end + close.length);
        this.#close = undefined;
      }
    }
    return out.join("");
  }

  flush(): string {
    if (this.#close !== undefined) {
      this.#buf = "";
      return "";
    }
    const rest = this.#buf;
    this.#buf = "";
    return rest;
  }
}

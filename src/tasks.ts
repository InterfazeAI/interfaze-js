import type OpenAI from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions/completions";
import type { InterfazeCompletions } from "./chat.js";
import { autoPart } from "./inputs.js";
import type { TaskName } from "./types.js";

type RequestOptions = OpenAI.RequestOptions;

function textPart(text: string): ChatCompletionContentPart {
  return { type: "text", text };
}

/**
 * High-level task helpers. Each forces the relevant task and returns its raw `result`.
 * `source` is an https URL or a `data:` URI (build one with `inputs.dataUrl()`/`fromPath()`).
 * The final `options` arg is passed to the request (per-call headers, signal, timeout, …).
 */
export class Tasks {
  #c: InterfazeCompletions;
  constructor(completions: InterfazeCompletions) {
    this.#c = completions;
  }

  async #run(
    task: TaskName,
    content: string | ChatCompletionContentPart[],
    options?: RequestOptions,
  ): Promise<unknown> {
    const res = await this.#c.create({ task, messages: [{ role: "user", content }] }, options);
    const raw = res.choices[0]?.message.content;
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw) as { result?: unknown };
      return parsed?.result ?? parsed;
    } catch {
      return raw;
    }
  }

  /** Extract text/structured data from an image or document. */
  ocr(source: string, opts: { prompt?: string } = {}, options?: RequestOptions): Promise<unknown> {
    return this.#run("ocr", [textPart(opts.prompt ?? "Extract all text and data."), autoPart(source)], options);
  }

  /** Detect objects in an image. */
  objectDetection(source: string, opts: { prompt?: string } = {}, options?: RequestOptions): Promise<unknown> {
    return this.#run("object_detection", [textPart(opts.prompt ?? "Detect all objects."), autoPart(source)], options);
  }

  /** Detect GUI elements in a screenshot. */
  guiDetection(source: string, opts: { prompt?: string } = {}, options?: RequestOptions): Promise<unknown> {
    return this.#run("gui_detection", [textPart(opts.prompt ?? "Detect all GUI elements."), autoPart(source)], options);
  }

  /** Transcribe an audio file. */
  transcribe(source: string, opts: { prompt?: string } = {}, options?: RequestOptions): Promise<unknown> {
    return this.#run("speech_to_text", [textPart(opts.prompt ?? "Transcribe this audio."), autoPart(source)], options);
  }

  /** Search the web. */
  webSearch(query: string, options?: RequestOptions): Promise<unknown> {
    return this.#run("web_search", query, options);
  }

  /** Scrape a web page. */
  scrape(url: string, opts: { prompt?: string } = {}, options?: RequestOptions): Promise<unknown> {
    return this.#run("scraper", `${opts.prompt ?? "Scrape this page"}: ${url}`, options);
  }

  /** Translate text into a target language. */
  translate(text: string, opts: { to: string }, options?: RequestOptions): Promise<unknown> {
    return this.#run("translate", `Translate the following into ${opts.to}:\n\n${text}`, options);
  }

  /** Forecast a time series from a CSV (MoE-selected, so prompt-driven; reads the `forecast` precontext). */
  async forecast(
    csvSource: string,
    opts: { periods?: number; unit?: string } = {},
    options?: RequestOptions,
  ): Promise<unknown> {
    const n = opts.periods ?? 10;
    const unit = opts.unit ?? "days";
    const res = await this.#c.create(
      { messages: [{ role: "user", content: `Forecast the next ${n} ${unit} of this: ${csvSource}` }] },
      options,
    );
    const pc = res.precontext?.find((p) => p.name === "forecast");
    return pc?.result ?? res.choices[0]?.message.content ?? undefined;
  }
}

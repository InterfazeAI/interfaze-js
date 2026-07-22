import { describe, expect, it } from "vitest";
import { ASSETS } from "./assets.js";
import { completion, jsonResponse, mockInterfaze, systemContent } from "./helpers.js";

function taskResult(name: string, result: unknown) {
  return jsonResponse(completion(JSON.stringify({ name, result })));
}

interface Part {
  type: string;
  [key: string]: unknown;
}

describe("tasks.ocr", () => {
  it("builds the <task>ocr</task> request and returns the raw result", async () => {
    const { interfaze, calls } = mockInterfaze(() =>
      taskResult("ocr", { extracted_text: "See back of receipt", width: 800 }),
    );
    const result = await interfaze.tasks.ocr(ASSETS.image);
    const body = calls[0]!.body!;
    expect(systemContent(body)).toContain("<task>ocr</task>");
    const messages = body["messages"] as Array<{ role: string; content: Part[] }>;
    const parts = messages[1]!.content;
    expect(parts[0]).toEqual({ type: "text", text: "Extract all text and data." });
    expect(parts[1]!["type"]).toBe("image_url");
    expect((parts[1]! as unknown as { image_url: { url: string } }).image_url.url).toBe(ASSETS.image);
    expect(result).toEqual({ extracted_text: "See back of receipt", width: 800 });
  });
});

describe("tasks.objectDetection", () => {
  it("builds the <task>object_detection</task> request and returns the raw result", async () => {
    const { interfaze, calls } = mockInterfaze(() =>
      taskResult("object_detection", { objects: [{ label: "bus", box: [0, 0, 10, 10] }] }),
    );
    const result = await interfaze.tasks.objectDetection(ASSETS.scene);
    const body = calls[0]!.body!;
    expect(systemContent(body)).toContain("<task>object_detection</task>");
    const messages = body["messages"] as Array<{ role: string; content: Part[] }>;
    const parts = messages[1]!.content;
    expect(parts[0]).toEqual({ type: "text", text: "Detect all objects." });
    expect(parts[1]!["type"]).toBe("image_url");
    expect((parts[1]! as unknown as { image_url: { url: string } }).image_url.url).toBe(ASSETS.scene);
    expect(result).toEqual({ objects: [{ label: "bus", box: [0, 0, 10, 10] }] });
  });
});

describe("tasks.guiDetection", () => {
  it("falls through to a generic file part (no extension to sniff) and returns the raw result", async () => {
    const { interfaze, calls } = mockInterfaze(() =>
      taskResult("gui_detection", { elements: [{ label: "button", box: [1, 2, 3, 4] }] }),
    );
    const result = await interfaze.tasks.guiDetection(ASSETS.gui);
    const body = calls[0]!.body!;
    expect(systemContent(body)).toContain("<task>gui_detection</task>");
    const messages = body["messages"] as Array<{ role: string; content: Part[] }>;
    const parts = messages[1]!.content;
    expect(parts[0]).toEqual({ type: "text", text: "Detect all GUI elements." });
    expect(parts[1]!["type"]).toBe("file");
    expect((parts[1]! as unknown as { file: { file_data: string } }).file.file_data).toBe(ASSETS.gui);
    expect(result).toEqual({ elements: [{ label: "button", box: [1, 2, 3, 4] }] });
  });
});

describe("tasks.transcribe", () => {
  it("builds the <task>speech_to_text</task> request with an input_audio part", async () => {
    const { interfaze, calls } = mockInterfaze(() => taskResult("speech_to_text", { text: "hello world" }));
    const result = await interfaze.tasks.transcribe(ASSETS.audio);
    const body = calls[0]!.body!;
    expect(systemContent(body)).toContain("<task>speech_to_text</task>");
    const messages = body["messages"] as Array<{ role: string; content: Part[] }>;
    const parts = messages[1]!.content;
    expect(parts[0]).toEqual({ type: "text", text: "Transcribe this audio." });
    expect(parts[1]!["type"]).toBe("input_audio");
    const inputAudio = (parts[1]! as unknown as { input_audio: { data: string; format: string } }).input_audio;
    expect(inputAudio.data).toBe(ASSETS.audio);
    expect(inputAudio.format).toBe("wav");
    expect(result).toEqual({ text: "hello world" });
  });
});

describe("tasks.webSearch", () => {
  it("sends the query as plain string content under <task>web_search</task>", async () => {
    const { interfaze, calls } = mockInterfaze(() =>
      taskResult("web_search", { results: [{ title: "AI agents", url: "https://example.com" }] }),
    );
    const result = await interfaze.tasks.webSearch("latest AI agent news");
    const body = calls[0]!.body!;
    expect(systemContent(body)).toContain("<task>web_search</task>");
    const messages = body["messages"] as Array<{ role: string; content: unknown }>;
    expect(messages[1]!.content).toBe("latest AI agent news");
    expect(result).toEqual({ results: [{ title: "AI agents", url: "https://example.com" }] });
  });
});

describe("tasks.scrape", () => {
  it("builds the <task>scraper</task> request with a prefixed URL string", async () => {
    const { interfaze, calls } = mockInterfaze(() => taskResult("scraper", { text: "Hacker News" }));
    const result = await interfaze.tasks.scrape(ASSETS.scrape);
    const body = calls[0]!.body!;
    expect(systemContent(body)).toContain("<task>scraper</task>");
    const messages = body["messages"] as Array<{ role: string; content: unknown }>;
    expect(messages[1]!.content).toBe(`Scrape this page: ${ASSETS.scrape}`);
    expect(result).toEqual({ text: "Hacker News" });
  });
});

describe("tasks.translate", () => {
  it("builds the <task>translate</task> request and unwraps the string result", async () => {
    const { interfaze, calls } = mockInterfaze(() => taskResult("translate", "Bonjour"));
    const result = await interfaze.tasks.translate("Hello there", { to: "French" });
    const body = calls[0]!.body!;
    expect(systemContent(body)).toContain("<task>translate</task>");
    const messages = body["messages"] as Array<{ role: string; content: unknown }>;
    expect(messages[1]!.content).toBe("Translate the following into French:\n\nHello there");
    expect(result).toBe("Bonjour");
  });
});

describe("tasks.forecast", () => {
  it("reads the forecast result from precontext (model-triggered, never <task>-tagged)", async () => {
    const body = completion("Here is the forecast.", {
      precontext: [{ name: "forecast", result: { forecast: [1, 2, 3] } }],
    });
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(body));
    const result = await interfaze.tasks.forecast(ASSETS.csv, { periods: 5, unit: "days" });
    const sent = calls[0]!.body!;
    const messages = sent["messages"] as Array<{ role: string; content: unknown }>;
    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe("user");
    expect(messages[0]!.content).toBe(`Forecast the next 5 days of this: ${ASSETS.csv}`);
    expect(result).toEqual({ forecast: [1, 2, 3] });
  });

  it("scans past unrelated precontext entries to find the forecast one", async () => {
    const mixed = completion("Here is the forecast.", {
      precontext: [
        { name: "ocr", result: { extracted_text: "date,value" } },
        { name: "forecast", result: { forecast: [4, 5, 6] } },
      ],
    });
    const { interfaze } = mockInterfaze(() => jsonResponse(mixed));
    const result = await interfaze.tasks.forecast(ASSETS.csv);
    expect(result).toEqual({ forecast: [4, 5, 6] });
  });

  it("falls back to the raw message content when forecast never ran", async () => {
    const fallback = completion("I couldn't run the forecast tool; here's a manual estimate.");
    const { interfaze } = mockInterfaze(() => jsonResponse(fallback));
    const result = await interfaze.tasks.forecast(ASSETS.csv);
    expect(result).toBe("I couldn't run the forecast tool; here's a manual estimate.");
  });

  it("returns undefined when there is neither a forecast precontext nor message content", async () => {
    const empty = completion(null, {
      finishReason: "tool_calls",
      toolCalls: [{ id: "call_1", type: "function", function: { name: "noop", arguments: "{}" } }],
    });
    const { interfaze } = mockInterfaze(() => jsonResponse(empty));
    const result = await interfaze.tasks.forecast(ASSETS.csv);
    expect(result).toBeUndefined();
  });
});

describe("task result extraction (via tasks.ocr, exercising the private #run parser)", () => {
  it("returns undefined for empty content", async () => {
    const { interfaze } = mockInterfaze(() => jsonResponse(completion("")));
    const result = await interfaze.tasks.ocr(ASSETS.image);
    expect(result).toBeUndefined();
  });

  it("returns the whole parsed object when there is no `result` key", async () => {
    const { interfaze } = mockInterfaze(() => jsonResponse(completion('{"name": "ocr"}')));
    const result = await interfaze.tasks.ocr(ASSETS.image);
    expect(result).toEqual({ name: "ocr" });
  });

  it("returns non-dict JSON content as-is", async () => {
    const { interfaze } = mockInterfaze(() => jsonResponse(completion("[1, 2, 3]")));
    const result = await interfaze.tasks.ocr(ASSETS.image);
    expect(result).toEqual([1, 2, 3]);
  });

  it("returns the raw string when content is not JSON", async () => {
    const { interfaze } = mockInterfaze(() => jsonResponse(completion("plain text result, not JSON")));
    const result = await interfaze.tasks.ocr(ASSETS.image);
    expect(result).toBe("plain text result, not JSON");
  });
});

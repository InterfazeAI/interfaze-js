import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Interfaze, type InterfazeOptions } from "../src/index.js";

export interface CapturedRequest {
  url: string;
  method?: string;
  headers: Headers;
  body: Record<string, unknown> | undefined;
}

/** Load a captured (real) Interfaze fixture. */
export function fixture<T = unknown>(name: string): T {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Build an Interfaze client whose transport is a mock `fetch`, capturing every request. */
export function mockInterfaze(
  responder: (req: CapturedRequest) => Response | Promise<Response>,
  options: Partial<InterfazeOptions> = {},
): { interfaze: Interfaze; calls: CapturedRequest[] } {
  const calls: CapturedRequest[] = [];
  const fetchImpl = async (input: unknown, init: RequestInit = {}): Promise<Response> => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const headers = new Headers((init.headers as HeadersInit) ?? (input as Request)?.headers);
    let raw: string | undefined = (init.body as string | undefined) ?? undefined;
    if (raw === undefined && input instanceof Request) raw = await input.clone().text();
    let body: Record<string, unknown> | undefined;
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
    } catch {
      body = undefined;
    }
    const req: CapturedRequest = { url, method: init.method, headers, body };
    calls.push(req);
    return responder(req);
  };
  const interfaze = new Interfaze({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: fetchImpl as unknown as InterfazeOptions["fetch"],
    ...options,
  });
  return { interfaze, calls };
}

export function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export function errorResponse(status: number, error: unknown): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Replay captured chunk objects as an OpenAI-style SSE stream. */
export function sseResponse(chunks: unknown[]): Response {
  const body =
    chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

/** Extract the system message that carries `<task>`/`<guard>` tags. */
export function systemContent(body: Record<string, unknown> | undefined): string {
  const messages = (body?.["messages"] as Array<{ role: string; content: unknown }>) ?? [];
  const sys = messages.find((m) => m.role === "system");
  return typeof sys?.content === "string" ? sys.content : "";
}

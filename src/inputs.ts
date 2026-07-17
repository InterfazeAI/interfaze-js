import type { ChatCompletionContentPart } from "openai/resources/chat/completions/completions";
import { BLACKLISTED_FORMATS } from "./constants.js";
import { InterfazeError } from "./errors.js";

export type BytesLike = Uint8Array | ArrayBuffer | Blob;

const EXT_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", bmp: "image/bmp", heic: "image/heic", heif: "image/heif",
  pdf: "application/pdf", csv: "text/csv", tsv: "text/tab-separated-values",
  xml: "application/xml", json: "application/json", txt: "text/plain",
  md: "text/markdown", markdown: "text/markdown", yaml: "application/yaml", yml: "application/yaml",
  wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", flac: "audio/flac",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", avi: "video/x-msvideo",
  mkv: "video/x-matroska", "3gp": "video/3gpp",
};

function mimeFromDataUrl(s: string): string | undefined {
  return s.startsWith("data:") ? s.slice(5).split(/[;,]/)[0] || undefined : undefined;
}
function extOf(urlOrName: string): string | undefined {
  return urlOrName.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase();
}
function assertAllowed(mime: string | undefined): void {
  if (mime && (BLACKLISTED_FORMATS as readonly string[]).includes(mime)) {
    throw new InterfazeError(`Format "${mime}" is not supported by Interfaze.`);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function toBytes(data: BytesLike): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof Blob !== "undefined" && data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  throw new InterfazeError("Unsupported bytes type; pass a Uint8Array, ArrayBuffer, or Blob.");
}

/** Build a base64 `data:` URI from bytes/Blob. */
export async function dataUrl(data: BytesLike, mimeType: string): Promise<string> {
  assertAllowed(mimeType);
  return `data:${mimeType};base64,${bytesToBase64(await toBytes(data))}`;
}

/** Node-only: read a local file into a `data:` URI. */
export async function fromPath(path: string): Promise<string> {
  if (typeof process === "undefined" || !process.versions?.node) {
    throw new InterfazeError("`fromPath` is Node-only. Use `dataUrl(bytes, mime)` elsewhere.");
  }
  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(path);
  const mime = EXT_MIME[extOf(path) ?? ""] ?? "application/octet-stream";
  return dataUrl(new Uint8Array(buf), mime);
}

/** Image part. `src` = https URL or `data:` URI. */
export function image(src: string): ChatCompletionContentPart {
  assertAllowed(mimeFromDataUrl(src) ?? EXT_MIME[extOf(src) ?? ""]);
  return { type: "image_url", image_url: { url: src } };
}

/** File part (pdf/csv/xml/json/text/audio/video/…). `src` = https URL or `data:` URI. */
export function file(
  src: string,
  opts: { filename?: string; format?: string } = {},
): ChatCompletionContentPart {
  const mime = opts.format ?? mimeFromDataUrl(src) ?? EXT_MIME[extOf(opts.filename ?? src) ?? ""];
  assertAllowed(mime);
  const f: { file_data: string; filename?: string; format?: string } = { file_data: src };
  if (opts.filename) f.filename = opts.filename;
  if (opts.format) f.format = opts.format;
  return { type: "file", file: f } as ChatCompletionContentPart;
}

/** Audio part via `input_audio` (`audio_url` is a dead field in Interfaze). */
export function audio(src: string, opts: { format?: string } = {}): ChatCompletionContentPart {
  const format = opts.format ?? extOf(src) ?? "wav";
  return { type: "input_audio", input_audio: { data: src, format } } as unknown as ChatCompletionContentPart;
}

/** Video part — rides on the `file` part (the OpenAI SDK has no video part). */
export function video(src: string, opts: { filename?: string } = {}): ChatCompletionContentPart {
  return file(src, opts);
}

/** Pick a content part by media type: image → image_url, audio → input_audio, else file. */
export function autoPart(src: string, opts: { filename?: string; format?: string } = {}): ChatCompletionContentPart {
  const mime = opts.format ?? mimeFromDataUrl(src) ?? EXT_MIME[extOf(opts.filename ?? src) ?? ""];
  if (mime?.startsWith("image/")) return image(src);
  if (mime?.startsWith("audio/")) return audio(src, opts.format ? { format: opts.format } : {});
  return file(src, opts);
}

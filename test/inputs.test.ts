import { describe, expect, it } from "vitest";
import { inputs, InterfazeError } from "../src/index.js";
import { ASSETS } from "./assets.js";

describe("input builders", () => {
  it("image() builds an image_url part", () => {
    expect(inputs.image("https://x.com/a.png")).toEqual({
      type: "image_url",
      image_url: { url: "https://x.com/a.png" },
    });
  });

  it("file() builds a file part with file_data", () => {
    const part = inputs.file("https://x.com/doc.pdf", { filename: "doc.pdf" }) as {
      type: string;
      file: { file_data: string; filename?: string };
    };
    expect(part.type).toBe("file");
    expect(part.file.file_data).toBe("https://x.com/doc.pdf");
    expect(part.file.filename).toBe("doc.pdf");
  });

  it("file() forwards the computed MIME as format", () => {
    const part = inputs.file("https://x.com/doc.pdf") as { file: { format?: string } };
    expect(part.file.format).toBe("application/pdf");
  });

  it("video() forwards the mp4 MIME as format", () => {
    const part = inputs.video("https://x.com/clip.mp4") as { type: string; file: { format?: string } };
    expect(part.type).toBe("file");
    expect(part.file.format).toBe("video/mp4");
  });

  it("file() omits format for an unknown extension", () => {
    const part = inputs.file("https://x.com/page") as { file: { format?: string } };
    expect(part.file.format).toBeUndefined();
  });

  it("audio() uses input_audio (never the dead audio_url)", () => {
    const part = inputs.audio("https://x.com/a.wav") as { type: string; input_audio: { data: string; format: string } };
    expect(part.type).toBe("input_audio");
    expect(part.input_audio.data).toBe("https://x.com/a.wav");
    expect(part.input_audio.format).toBe("wav");
  });

  it("audio() derives format from a data-URI mime subtype", () => {
    const part = inputs.audio("data:audio/mpeg;base64,AAAA") as { input_audio: { format: string } };
    expect(part.input_audio.format).toBe("mpeg");
  });

  it("audio() rejects a blacklisted data-URI", () => {
    expect(() => inputs.audio("data:image/gif;base64,AAAA")).toThrow(InterfazeError);
  });

  it("rejects blacklisted gif via URL", () => {
    expect(() => inputs.image("https://x.com/a.gif")).toThrow(InterfazeError);
  });

  it("rejects blacklisted avif via explicit format", () => {
    expect(() => inputs.file("https://x.com/a", { format: "image/avif" })).toThrow(/not supported/i);
  });

  it("dataUrl() base64-encodes bytes into a data URI", async () => {
    const url = await inputs.dataUrl(new Uint8Array([104, 105]), "text/plain"); // "hi"
    expect(url).toBe("data:text/plain;base64,aGk=");
  });

  it("dataUrl() rejects blacklisted mime", async () => {
    await expect(inputs.dataUrl(new Uint8Array([1]), "image/gif")).rejects.toThrow(InterfazeError);
  });

  it("autoPart() routes by media type", () => {
    expect(inputs.autoPart("https://x.com/a.png").type).toBe("image_url");
    expect(inputs.autoPart("https://x.com/a.wav").type).toBe("input_audio");
    expect(inputs.autoPart("https://x.com/a.pdf").type).toBe("file");
    expect(inputs.autoPart("https://x.com/a.mp4").type).toBe("file");
    expect((inputs.autoPart("https://x.com/a.mp4") as { file: { format?: string } }).file.format).toBe("video/mp4");
  });

  it("autoPart() forwards a data-URI audio format", () => {
    const part = inputs.autoPart("data:audio/mpeg;base64,AAAA") as { type: string; input_audio: { format: string } };
    expect(part.type).toBe("input_audio");
    expect(part.input_audio.format).toBe("mpeg");
  });

  it("audio() derives format from a data-URI mime subtype (wav)", () => {
    const part = inputs.audio("data:audio/wav;base64,AAAA") as { input_audio: { format: string } };
    expect(part.input_audio.format).toBe("wav");
  });

  it("video() rides on file with the right file_data", () => {
    const part = inputs.video(ASSETS.video) as { type: string; file: { file_data: string; format?: string } };
    expect(part.type).toBe("file");
    expect(part.file.file_data).toBe(ASSETS.video);
    expect(part.file.format).toBe("video/mp4");
  });

  it("video() forwards a filename onto the file part", () => {
    const part = inputs.video(ASSETS.video, { filename: "clip.mp4" }) as {
      type: string;
      file: { file_data: string; filename?: string };
    };
    expect(part.type).toBe("file");
    expect(part.file.file_data).toBe(ASSETS.video);
    expect(part.file.filename).toBe("clip.mp4");
  });

  it("image() built from a base64 data URL round-trips through dataUrl()", async () => {
    const url = await inputs.dataUrl(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "image/png");
    const part = inputs.image(url) as { type: string; image_url: { url: string } };
    expect(part.type).toBe("image_url");
    expect(part.image_url.url.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("file() includes an explicitly passed format even for an unrecognized extension", () => {
    const part = inputs.file("https://x.com/data.bin", { format: "application/octet-stream" }) as {
      file: { format?: string };
    };
    expect(part.file.format).toBe("application/octet-stream");
  });

  it("file() with an unknown extension omits both format and filename when unset", () => {
    const part = inputs.file("https://example.com/dataset.xyz123") as {
      file: { format?: string; filename?: string };
    };
    expect(part.file.format).toBeUndefined();
    expect(part.file.filename).toBeUndefined();
  });

  it("autoPart() forwards a filename for pdf routing", () => {
    const part = inputs.autoPart(ASSETS.pdf, { filename: "paper.pdf" });
    expect(part.type).toBe("file");
  });

  it("autoPart() falls through to a generic file part for extensionless URLs", () => {
    // ASSETS.pdf (bare arxiv URL) and ASSETS.gui (query-string-only unsplash URL) have no
    // recognizable file extension, so autoPart can't sniff a mime type — even for `gui`,
    // which is actually an image.
    expect(inputs.autoPart(ASSETS.pdf).type).toBe("file");
    expect(inputs.autoPart(ASSETS.gui).type).toBe("file");
  });

  it("image() tolerates a malformed data URL with no mime segment", () => {
    const part = inputs.image("data:;base64,YWJj");
    expect(part).toEqual({ type: "image_url", image_url: { url: "data:;base64,YWJj" } });
  });
});

describe("dataUrl() bytes-like inputs", () => {
  it("accepts an ArrayBuffer", async () => {
    const buf = new Uint8Array([104, 105]).buffer;
    const url = await inputs.dataUrl(buf, "text/plain");
    expect(url).toBe("data:text/plain;base64,aGk=");
  });

  it("accepts a Blob", async () => {
    const blob = new Blob([new Uint8Array([104, 105])], { type: "text/plain" });
    const url = await inputs.dataUrl(blob, "text/plain");
    expect(url).toBe("data:text/plain;base64,aGk=");
  });

  it("rejects an unsupported bytes type", async () => {
    await expect(inputs.dataUrl("not-bytes" as never, "text/plain")).rejects.toThrow(InterfazeError);
  });

  it("falls back to a manual base64 encoder when Buffer is unavailable", async () => {
    const original = globalThis.Buffer;
    // @ts-expect-error test-only: simulate a non-Node environment for bytesToBase64's btoa path
    delete globalThis.Buffer;
    try {
      const url = await inputs.dataUrl(new Uint8Array([104, 105]), "text/plain");
      expect(url).toBe("data:text/plain;base64,aGk=");
    } finally {
      globalThis.Buffer = original;
    }
  });
});

describe("fromPath() (Node-only)", () => {
  it("reads a local file into a data: URI", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "interfaze-"));
    const path = join(dir, "note.txt");
    writeFileSync(path, "hello world");
    const result = await inputs.fromPath(path);
    expect(result.startsWith("data:text/plain;base64,")).toBe(true);
    const encoded = result.split(",", 2)[1]!;
    expect(Buffer.from(encoded, "base64").toString()).toBe("hello world");
  });

  it("picks the mime type from the file extension", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "interfaze-"));
    const path = join(dir, "photo.png");
    writeFileSync(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const result = await inputs.fromPath(path);
    expect(result.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("defaults to application/octet-stream for an unknown extension", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "interfaze-"));
    const path = join(dir, "file.someunknownext");
    writeFileSync(path, "data");
    const result = await inputs.fromPath(path);
    expect(result.startsWith("data:application/octet-stream;base64,")).toBe(true);
  });

  it("raises on a blacklisted extension", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "interfaze-"));
    const path = join(dir, "anim.gif");
    writeFileSync(path, "GIF89a");
    await expect(inputs.fromPath(path)).rejects.toThrow(InterfazeError);
  });

  it("throws a clear error outside Node (no process.versions.node)", async () => {
    const original = process.versions;
    // @ts-expect-error test-only: simulate a non-Node runtime
    delete process.versions;
    try {
      await expect(inputs.fromPath("/tmp/whatever")).rejects.toThrow(/Node-only/);
    } finally {
      Object.defineProperty(process, "versions", { value: original, configurable: true, writable: true });
    }
  });
});

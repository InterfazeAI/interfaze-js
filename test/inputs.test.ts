import { describe, expect, it } from "vitest";
import { inputs, InterfazeError } from "../src/index.js";

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
    expect((inputs.autoPart("https://x.com/a.mp4") as { file: { format?: string } }).file.format).toBe(
      "video/mp4",
    );
  });

  it("autoPart() forwards a data-URI audio format", () => {
    const part = inputs.autoPart("data:audio/mpeg;base64,AAAA") as { type: string; input_audio: { format: string } };
    expect(part.type).toBe("input_audio");
    expect(part.input_audio.format).toBe("mpeg");
  });
});

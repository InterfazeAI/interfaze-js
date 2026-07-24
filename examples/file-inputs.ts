import { Interfaze, inputs } from "interfaze";

const interfaze = new Interfaze();

// 1. File-part URL
const a = await interfaze.chat.completions.create({
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "Summarize this PDF." },
        inputs.file("https://arxiv.org/pdf/1706.03762", { filename: "paper.pdf" }),
      ],
    },
  ],
});
console.log(a.choices[0]?.message.content);

// 2. base64 (from a local file, Node-only) — or inputs.dataUrl(bytes, mime) in any runtime
const b = await interfaze.chat.completions.create({
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "What is in this image?" }, inputs.image(await inputs.fromPath("./photo.png"))],
    },
  ],
});
console.log(b.choices[0]?.message.content);

// 3. Inline URL (Interfaze lifts recognized URLs from the text)
const c = await interfaze.chat.completions.create({
  messages: [{ role: "user", content: "Transcribe this audio: https://example.com/clip.wav" }],
});
console.log(c.choices[0]?.message.content);

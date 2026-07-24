import { Interfaze } from "interfaze";

const interfaze = new Interfaze({ showAdditionalInfo: true });

const stream = interfaze.chat.completions.stream({
  messages: [{ role: "user", content: "What are the latest developments in AI agents this week? Cite your sources." }],
});

for await (const text of stream.textDeltas()) {
  process.stdout.write(text);
}

const final = await stream.finalChatCompletion();
console.log("\n\nprecontext:", JSON.stringify(final.precontext, null, 2));

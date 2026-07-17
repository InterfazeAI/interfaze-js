import { Interfaze } from "interfaze";

const interfaze = new Interfaze();

const stream = interfaze.chat.completions.stream({
  reasoning_effort: "high",
  messages: [{ role: "user", content: "Explain why the sky is blue." }],
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}

const final = await stream.finalChatCompletion();
console.log("\n\nreasoning:", final.reasoning);
console.log("precontext:", final.precontext);

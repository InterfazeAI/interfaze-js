import { Interfaze } from "interfaze";

const interfaze = new Interfaze();

const res = await interfaze.chat.completions.create({
  reasoning_effort: "high", // also accepts Interfaze's "on" / "off" / "auto"
  messages: [{ role: "user", content: "Which region should we launch in first, and why?" }],
});

console.log("answer:\n", res.choices[0]?.message.content);
console.log("\nreasoning:\n", res.reasoning); // present with reasoning_effort and no schema

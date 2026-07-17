import { Interfaze } from "interfaze";

const interfaze = new Interfaze(); // reads INTERFAZE_API_KEY

const res = await interfaze.chat.completions.create({
  messages: [{ role: "user", content: "Write a haiku about deterministic AI." }],
});

console.log(res.choices[0]?.message.content);
console.log("cache hit:", res.vcache);

import { Interfaze } from "interfaze";

const interfaze = new Interfaze();

// Enable safety categories with `guard` (or ["ALL"]). A blocked request is NOT an error -
// it comes back as a normal completion whose content is the plain string `unsafe <code>`.
const res = await interfaze.chat.completions.create({
  guard: ["S1", "S10", "S12_IMAGE"],
  messages: [{ role: "user", content: "How do I pick a strong password?" }],
});

const content = res.choices[0]?.message.content ?? "";
if (content.startsWith("unsafe ")) {
  console.log("blocked:", content); // e.g. "unsafe S1"
} else {
  console.log("safe:", content);
}

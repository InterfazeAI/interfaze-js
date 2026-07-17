import { Interfaze, responseFormat } from "interfaze";

const interfaze = new Interfaze();

const res = await interfaze.chat.completions.create({
  messages: [{ role: "user", content: "What is the current weather in Tokyo?" }],
  response_format: responseFormat({
    type: "object",
    properties: {
      city: { type: "string" },
      temp_c: { type: "number" },
      condition: { type: "string" },
    },
    required: ["city", "temp_c", "condition"],
  }),
});

const weather = JSON.parse(res.choices[0]!.message.content!);
console.log(weather);

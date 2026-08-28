import { Interfaze } from "interfaze";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "interfaze";

const interfaze = new Interfaze();

// Your real implementation goes here; return a string for the model.
async function getWeather(city: string): Promise<string> {
  return JSON.stringify({ city, temp_c: 18, condition: "cloudy" });
}

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get the current weather for a city.",
      parameters: {
        type: "object",
        properties: { city: { type: "string", description: "e.g. Tokyo" } },
        required: ["city"],
      },
    },
  },
];

const messages: ChatCompletionMessageParam[] = [{ role: "user", content: "What's the weather in Tokyo?" }];

// 1. First call — the model decides whether to call a tool.
const res = await interfaze.chat.completions.create({ messages, tools, tool_choice: "auto" });
const message = res.choices[0]?.message;
if (message) messages.push(message); // the assistant turn, carrying any tool_calls

// 2. Run each requested tool and append its result.
for (const call of message?.tool_calls ?? []) {
  if (call.type !== "function") continue;
  const { city } = JSON.parse(call.function.arguments);
  messages.push({ role: "tool", tool_call_id: call.id, content: await getWeather(city) });
}

// 3. Send the tool results back for the final answer.
const final = await interfaze.chat.completions.create({ messages, tools, tool_choice: "auto" });
console.log(final.choices[0]?.message.content);

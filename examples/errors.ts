import { AuthenticationError, BadRequestError, Interfaze, InterfazeError, RateLimitError } from "interfaze";

const interfaze = new Interfaze();

try {
  const res = await interfaze.chat.completions.create({
    messages: [{ role: "user", content: "Hello!" }],
  });
  console.log(res.choices[0]?.message.content);
} catch (err) {
  // `InterfazeError` is client-side (missing key, invalid guard code, stream misuse).
  // Everything else is an APIError subclass carrying `status` and `code`.
  if (err instanceof RateLimitError) {
    console.error("rate limited (429) - back off and retry:", err.message);
  } else if (err instanceof AuthenticationError) {
    console.error("auth failed (401) - check INTERFAZE_API_KEY:", err.message);
  } else if (err instanceof BadRequestError) {
    console.error("bad request (400):", err.message);
  } else if (err instanceof InterfazeError) {
    console.error("client-side error:", err.message);
  } else {
    throw err;
  }
}

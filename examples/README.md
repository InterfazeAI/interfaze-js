# Examples

Runnable snippets. Install the package and set your key first:

```bash
npm install interfaze
export INTERFAZE_API_KEY="sk_..."
npx tsx examples/quickstart.ts
```

Keyless access needs a release of `interfaze` later than 1.0.3. With such a release, you can leave out the `export` line and run the examples without a key. Without an API key, `Interfaze` sends requests with no `Authorization` header. This works only from server-side code. Interfaze limits keyless requests from each IP address and does not accept them from a browser. A blank key counts as no key. See [Try Interfaze without an API key](https://interfaze.ai/docs#try-interfaze-without-an-api-key) and the [keyless limits](https://interfaze.ai/docs/limits#keyless-access). When the keyless daily limit is reached, the client throws the `429` and does not retry it while the reset is more than a minute away.

- `quickstart.ts` — first request
- `tasks.ts` — task helpers (ocr, webSearch, forecast, translate, …)
- `streaming.ts` — streaming + reasoning + precontext
- `structured-output.ts` — JSON schema output
- `tools.ts` — function calling (tool_calls round-trip)
- `reasoning.ts` — `reasoning_effort` → `res.reasoning`
- `guardrails.ts` — `guard` categories; a block returns `unsafe <code>`
- `file-inputs.ts` — file-part URL, base64, and inline-URL inputs
- `errors.ts` — catching and narrowing typed errors

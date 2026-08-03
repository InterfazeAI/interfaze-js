# Examples

Runnable snippets. Install the package and set your key first:

```bash
npm install interfaze
export INTERFAZE_API_KEY="sk_..."
npx tsx examples/quickstart.ts
```

- `quickstart.ts` — first request
- `tasks.ts` — task helpers (ocr, webSearch, forecast, translate, …)
- `streaming.ts` — streaming + reasoning + precontext
- `structured-output.ts` — JSON schema output
- `tools.ts` — function calling (tool_calls round-trip)
- `reasoning.ts` — `reasoning_effort` → `res.reasoning`
- `guardrails.ts` — `guard` categories; a block returns `unsafe <code>`
- `file-inputs.ts` — file-part URL, base64, and inline-URL inputs
- `errors.ts` — catching and narrowing typed errors

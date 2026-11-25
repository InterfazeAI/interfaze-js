# Changelog

All notable changes to `interfaze` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Keyless access: with no `apiKey` and no `INTERFAZE_API_KEY`, `new Interfaze()` constructs and sends requests without an `Authorization` header, instead of throwing `InterfazeError`. It never falls back to `OPENAI_API_KEY` or `OPENAI_ADMIN_KEY`. An explicit `apiKey` takes precedence over `INTERFAZE_API_KEY`, and an empty or whitespace-only key counts as no key. A new key from `client.openai.withOptions({ apiKey })` is sent. A caller `Authorization` header counts as a key. Keyless access needs a release of `interfaze` later than 1.0.3.
- A keyless client throws `InterfazeError` before any request when `'document' in globalThis`, also with `dangerouslyAllowBrowser: true`. The API does not accept keyless requests from a browser.
- When the keyless daily limit is reached, the client throws the `429` and does not retry it while the reset is more than a minute away. A `401` and an in-flight `429` keep their behavior.

### Changed

- **BREAKING:** renamed the `bypassMoe` client option to `bypassMoA` (its header is now `x-interfaze-bypass-moa`), matching the server's mixture-of-architectures router. The `bypassCache` header also moved to `x-interfaze-bypass-cache`; `x-show-additional-info` and `x-admin-key` are unchanged. Consumers passing `bypassMoe` must rename it to `bypassMoA`.

## [0.1.0] - 2026-07-16

Initial release — a typed wrapper over the OpenAI SDK for the Interfaze API.

### Added

- `Interfaze` client (composition over `openai@6`) exposing `chat.completions`, `models`, and `tasks.*`.
- `chat.completions.create()` returning `InterfazeChatCompletion` with typed `precontext`, `reasoning`, and `vcache`.
- `chat.completions.stream()` — an Interfaze-tolerant streaming helper (handles role-less deltas; surfaces `<think>`/`<precontext>`).
- Task helpers: `ocr`, `webSearch`, `transcribe`, `forecast`, `scrape`, `translate`, `objectDetection`, `guiDetection` (each accepts per-request options).
- `task` / `guard` params and a widened `reasoning_effort` (`on`/`off`/`auto`).
- `inputs.*` content-part builders (`image`, `file`, `audio`, `video`, `dataUrl`, `fromPath`, `autoPart`) — URL, base64, and inline supported; `image/gif`/`image/avif` rejected client-side.
- `responseFormat()` / `emptyTaskSchema()` helpers, control-plane options (`showAdditionalInfo`, `bypassMoe`, `bypassCache`, `adminKey`), and `InterfazeError`.
- Universal build: Node 18+, browsers, edge/workers; dual ESM + CommonJS.

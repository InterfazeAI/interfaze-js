# Changelog

All notable changes to `interfaze` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

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

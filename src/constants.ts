export const INTERFAZE_BASE_URL = "https://api.interfaze.ai/v1";
export const INTERFAZE_MODEL = "interfaze-beta";

/** Task names accepted in a `<task>…</task>` tag. */
export const TASK_NAMES = [
  "ocr",
  "object_detection",
  "gui_detection",
  "web_search",
  "scraper",
  "translate",
  "speech_to_text",
] as const;

/** Guardrail categories (`ALL` enables everything). */
export const GUARD_CODES = [
  "S1", "S2", "S3", "S4", "S5", "S6", "S7",
  "S8", "S9", "S10", "S11", "S12", "S13", "S14",
  "S1_IMAGE", "S12_IMAGE", "S15_IMAGE",
  "ALL",
] as const;

/** Human labels for guard codes. */
export const GUARD_LABELS: Record<string, string> = {
  S1: "Violent Crimes",
  S2: "Non-Violent Crimes",
  S3: "Sex-Related Crimes",
  S4: "Child Sexual Exploitation",
  S5: "Defamation",
  S6: "Specialized Advice",
  S7: "Privacy",
  S8: "Intellectual Property",
  S9: "Indiscriminate Weapons",
  S10: "Hate",
  S11: "Suicide & Self-Harm",
  S12: "Sexual Content",
  S13: "Elections",
  S14: "Code Interpreter Abuse",
  S1_IMAGE: "Gore (image)",
  S12_IMAGE: "Nudity (image)",
  S15_IMAGE: "NSFW (image)",
  ALL: "All categories",
};

/** Formats Interfaze rejects. */
export const BLACKLISTED_FORMATS = ["image/gif", "image/avif"] as const;

/** Server-side limits, used for friendly early warnings. */
export const LIMITS = {
  maxInlineTextBytesPerFile: 250_000,
  maxTotalInlineTextBytes: 1_000_000,
  maxForecastDatasetBytes: 25 * 1024 * 1024,
  maxInputTokens: 1_000_000,
  maxOutputTokens: 32_000,
} as const;

/** Interfaze control-plane headers. */
export const HEADERS = {
  showAdditionalInfo: "x-show-additional-info",
  bypassMoe: "x-bypass-moe",
  bypassCache: "x-bypass-cache",
  adminKey: "x-admin-key",
} as const;

import { GUARD_CODES } from "./constants.js";
import { InterfazeError } from "./errors.js";
import type { GuardCode } from "./types.js";

const VALID = new Set<string>(GUARD_CODES);

/** Serialize guardrail categories into the `<guard>…</guard>` tag, validating codes. */
export function guardTag(codes: GuardCode[]): string {
  if (!codes.length) throw new InterfazeError("`guard` must contain at least one code");
  const invalid = codes.filter((c) => !VALID.has(c));
  if (invalid.length) {
    throw new InterfazeError(`Invalid guard code(s): ${invalid.join(", ")}. Valid codes: ${GUARD_CODES.join(", ")}`);
  }
  return `<guard>${codes.join(", ")}</guard>`;
}

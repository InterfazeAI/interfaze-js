/** SDK-level (client-side) error. HTTP errors surface as the OpenAI error classes re-exported from the package root. */
export class InterfazeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "InterfazeError";
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

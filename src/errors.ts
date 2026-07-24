/** SDK-level (client-side) error.*/
export class InterfazeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "InterfazeError";
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

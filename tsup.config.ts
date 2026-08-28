import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  treeshake: true,
  splitting: false,
  noExternal: [/^openai(\/|$)/],
  external: ["zod"],
  esbuildOptions(options, context) {
    options.sourcesContent = false;
    if (context.format === "esm") {
      // Provide `require` for the lazily-loaded `openai/helpers/zod` (see src/_compat.ts).
      // Building it lazily (rather than calling createRequire eagerly) keeps the ESM entry
      // loadable on non-Node runtimes: it only touches `node:module` when zodResponseFormat
      // is actually called, instead of at import time.
      options.banner = {
        js: "import { createRequire as _cr } from 'node:module';\nlet _req;\nconst require = (id) => (_req ??= _cr(import.meta.url))(id);",
      };
    }
  },
});

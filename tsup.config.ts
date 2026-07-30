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
      options.banner = {
        js: "import { createRequire as _cr } from 'module';\nconst require = _cr(import.meta.url);",
      };
    }
  },
});

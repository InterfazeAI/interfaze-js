import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: {
    resolve: [/^openai(\/|$)/],
  },
  clean: true,
  sourcemap: true,
  target: "es2022",
  splitting: false,
  noExternal: ["openai"],
  external: ["zod"],
  esbuildOptions(options) {
    options.sourcesContent = false;
  },
});


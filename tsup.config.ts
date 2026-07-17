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
  // `openai` (and optional `zod`) stay external — they're deps, not bundled.
  external: ["openai", "zod"],
});


/**
 * Post-processes tsup-generated .d.ts/.d.cts to fix phantom relative
 * imports/exports left by rollup-plugin-dts when it partially inlines
 * the openai type graph.
 *
 * - `import` lines with unresolvable specifiers are removed (the types
 *   they reference are used as ambient declarations already inlined).
 * - `export { X, Y } from './phantom.js'` lines are rewritten to
 *   inline the needed declarations from node_modules/openai and emit
 *   a bare `export { X, Y }` statement.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

const outDir = "dist";
const targets = ["index.d.ts", "index.d.cts"];

/**
 * Map from phantom specifier suffix to the actual source .d.ts in
 * node_modules/openai that contains the declarations.
 */
const specifierToSource: Record<string, string> = {
  "/core/error.js": "node_modules/openai/core/error.d.ts",
  "/core/uploads.js": "node_modules/openai/core/uploads.d.ts",
};

/**
 * Read an openai .d.ts and extract `export declare class/function/...`
 * blocks for the given names. Handles single-line and multi-line
 * declarations terminated by `}` at column 0.
 */
function extractDeclarations(sourcePath: string, names: Set<string>): string {
  if (!existsSync(sourcePath)) {
    console.warn(`  Source not found: ${sourcePath}`);
    return "";
  }

  const src = readFileSync(sourcePath, "utf8");
  const lines = src.split("\n");
  const chunks: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    const match = line.match(
      /^export declare (class|function|type|interface|const|let|var)\s+(\w+)/,
    );
    if (!match || !names.has(match[2]!)) continue;

    // `toFile` is a re-export from another file; follow it
    if (line.startsWith("export {") || line.startsWith("export type {")) {
      continue;
    }

    if (line.match(/;\s*$/)) {
      chunks.push(line.replace(/^export /, ""));
    } else {
      const block = [line.replace(/^export /, "")];
      let depth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      for (let j = i + 1; j < lines.length && depth > 0; j++) {
        const l = lines[j]!;
        block.push(l);
        depth += (l.match(/{/g) || []).length - (l.match(/}/g) || []).length;
      }
      chunks.push(block.join("\n"));
    }
  }

  return chunks.join("\n");
}

/**
 * For `toFile`, the declaration lives in `internal/to-file.d.ts`, not
 * `core/uploads.d.ts` (which just re-exports). Read it directly.
 */
function extractToFile(): string {
  const src = readFileSync("node_modules/openai/internal/to-file.d.ts", "utf8");
  const lines = src.split("\n");
  const chunks: string[] = [];
  let capture = false;

  for (const line of lines) {
    if (line.includes("interface BlobLike")) capture = true;
    if (line.includes("interface FileLike")) capture = true;
    if (line.includes("interface ResponseLike")) capture = true;
    if (line.includes("type ToFileInput")) capture = true;
    if (line.includes("type BlobLikePart")) capture = true;
    if (line.includes("function toFile")) capture = true;

    if (capture) {
      chunks.push(line.replace(/^export /, ""));
      if (line.match(/^}\s*$/) || line.match(/;\s*$/)) capture = false;
    }
  }

  return chunks.join("\n");
}

for (const file of targets) {
  const filePath = resolve(outDir, file);
  if (!existsSync(filePath)) {
    console.warn(`Skipping ${file}: not found`);
    continue;
  }

  let src = readFileSync(filePath, "utf8");
  const dir = dirname(filePath);

  const importRe =
    /^import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|type\s+\{[^}]*\})\s*from\s*['"](\.[^'"]+)['"]\s*;?\s*$/gm;

  const exportFromRe =
    /^export\s+\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]\s*;?\s*$/gm;

  const phantomImports: string[] = [];
  const inlinedDecls: string[] = [];
  const bareExports: string[] = [];

  // Remove phantom imports
  src = src.replace(importRe, (line, specifier: string) => {
    const candidate = join(dir, specifier);
    const exists =
      existsSync(candidate) ||
      existsSync(candidate + ".ts") ||
      existsSync(candidate + ".d.ts") ||
      existsSync(candidate.replace(/\.js$/, ".d.ts"));

    if (!exists) {
      phantomImports.push(specifier);
      return "";
    }
    return line;
  });

  // Handle phantom export-from lines
  src = src.replace(exportFromRe, (line, nameList: string, specifier: string) => {
    const candidate = join(dir, specifier);
    const exists =
      existsSync(candidate) ||
      existsSync(candidate + ".ts") ||
      existsSync(candidate + ".d.ts") ||
      existsSync(candidate.replace(/\.js$/, ".d.ts"));

    if (!exists) {
      const names = nameList
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      const nameSet = new Set(names);

      // Find matching source file
      const sourceKey = Object.keys(specifierToSource).find((key) =>
        specifier.endsWith(key),
      );

      if (sourceKey) {
        const decls = extractDeclarations(
          specifierToSource[sourceKey]!,
          nameSet,
        );
        if (decls) inlinedDecls.push(decls);
      }

      // Handle toFile specially
      if (nameSet.has("toFile")) {
        inlinedDecls.push(extractToFile());
      }

      bareExports.push(`export { ${names.join(", ")} };`);
      return "";
    }
    return line;
  });

  if (phantomImports.length > 0 || bareExports.length > 0) {
    // Clean up blank lines
    src = src.replace(/^\s*\n/gm, "\n").replace(/^\n+/, "");

    // Insert inlined declarations and bare exports before the final
    // consolidated export line
    if (inlinedDecls.length > 0 || bareExports.length > 0) {
      const suffix = [
        ...inlinedDecls,
        "",
        ...bareExports,
      ].join("\n");

      // Find the final `export { ... }` line and insert before it
      const lastExportIdx = src.lastIndexOf("\nexport {");
      if (lastExportIdx !== -1) {
        src =
          src.slice(0, lastExportIdx) +
          "\n" +
          suffix +
          "\n" +
          src.slice(lastExportIdx);
      } else {
        src += "\n" + suffix + "\n";
      }
    }

    writeFileSync(filePath, src);
    console.log(
      `${file}: removed ${phantomImports.length} phantom imports, inlined ${inlinedDecls.length} declaration blocks, added ${bareExports.length} bare exports`,
    );
  } else {
    console.log(`${file}: no phantom imports found`);
  }
}

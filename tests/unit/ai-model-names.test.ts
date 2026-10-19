import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Invariant Check:
 * "No model name string exists outside config and tests (grep check)"
 * Model names MUST only exist in config (src/lib/config) and tests (tests/**).
 */

const SUSPICIOUS_MODEL_PATTERNS = [
  /gemini-[\w.-]+/i,
  /gpt-4[\w.-]*/i,
  /gpt-3\.5[\w.-]*/i,
  /claude-[\w.-]+/i,
  /llama-[\w.-]+/i,
  /mistral-[\w.-]+/i,
];

function getFilesRecursively(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") || entry.name.endsWith(".js"))
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("Model Name Invariant: Model names live only in config", () => {
  it("verifies that no model name strings exist outside config and tests", () => {
    const srcDir = path.join(process.cwd(), "src");
    const allSrcFiles = getFilesRecursively(srcDir);

    const violations: Array<{ file: string; match: string; line: number }> = [];

    for (const filePath of allSrcFiles) {
      // Exclude config directory
      const relativePath = path.relative(srcDir, filePath);
      if (relativePath.startsWith("lib/config/")) {
        continue;
      }

      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        for (const pattern of SUSPICIOUS_MODEL_PATTERNS) {
          const match = line.match(pattern);
          if (match) {
            violations.push({
              file: relativePath,
              match: match[0],
              line: index + 1,
            });
          }
        }
      });
    }

    if (violations.length > 0) {
      console.error("Model name violations detected in src/ outside config:", violations);
    }

    expect(violations).toHaveLength(0);
  });
});

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const FORBIDDEN = [
  "Aimed Outreach",
  "AimedOutreach",
  "aimedoutreach",
  "myaimedoutreach",
  "SalesForecaster",
  "salesforecaster",
  "Email Platform",
] as const;

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
  "docs",
  "ad-hoc",
]);

const SKIP_FILES = new Set([
  join("src", "lib", "legal", "eula-seed.ts"),
  join("src", "lib", "product-config", "brand-regression.test.ts"),
]);

function shouldSkip(absPath: string): boolean {
  const rel = relative(ROOT, absPath);
  if (SKIP_FILES.has(rel)) return true;
  const parts = rel.split(sep);
  return parts.some((part) => SKIP_DIR_NAMES.has(part));
}

function walk(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (shouldSkip(abs)) continue;
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      walk(abs, files);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|md|json)$/i.test(entry)) continue;
    files.push(abs);
  }
}

describe("legacy brand names", () => {
  it("do not appear in source outside the EULA seed, docs/, and this test", () => {
    const files: string[] = [];
    walk(join(ROOT, "src"), files);
    walk(join(ROOT, "scripts"), files);

    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const needle of FORBIDDEN) {
        if (text.includes(needle)) {
          hits.push(`${relative(ROOT, file)}: ${needle}`);
        }
      }
    }

    expect(hits).toEqual([]);
  });
});

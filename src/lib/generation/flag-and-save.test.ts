import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { isObsoleteWorkspaceFailure } from "@/lib/product-config";

const ROOT = process.cwd();
const BLOCKING_PHRASES = [
  "did not pass checks",
  "not enough to save",
  "did not pass verification",
  "could not be grounded",
  "Clarifying questions could not be written.",
  "Thank-you questions could not be written.",
] as const;

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
  "docs",
]);

const ALLOWED_BLOCKING_FILES = new Set([
  join("src", "lib", "product-config", "obsolete-workspace-failures.ts"),
  join("src", "lib", "generation", "flag-and-save.test.ts"),
  join("src", "lib", "application-jobs", "workspace-failures.test.ts"),
  join("src", "lib", "application-summary", "application-summary.test.ts"),
  join("src", "lib", "product-config", "product-config.test.ts"),
]);

function shouldSkip(absPath: string): boolean {
  const rel = relative(ROOT, absPath);
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
    if (!/\.(ts|tsx)$/i.test(entry)) continue;
    files.push(abs);
  }
}

describe("flag-and-save remaining checks", () => {
  it("treats leftover quality-block messages as obsolete", () => {
    for (const phrase of BLOCKING_PHRASES) {
      expect(isObsoleteWorkspaceFailure(phrase)).toBe(true);
    }
    expect(
      isObsoleteWorkspaceFailure(
        "Application Summary guidance did not pass checks. The passing parts were not enough to save. Retry.",
      ),
    ).toBe(true);
    expect(isObsoleteWorkspaceFailure("The model did not return a usable asset.")).toBe(
      false,
    );
  });

  it("does not fail a generator on a quality or verification check", () => {
    const files: string[] = [];
    walk(join(ROOT, "src", "lib"), files);
    const hits: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file);
      if (ALLOWED_BLOCKING_FILES.has(rel) || rel.endsWith(".test.ts")) continue;
      const text = readFileSync(file, "utf8");
      for (const phrase of BLOCKING_PHRASES) {
        if (text.includes(phrase)) {
          hits.push(`${rel}: ${phrase}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("has no seeker-facing Application Summary copy", () => {
    const files: string[] = [];
    walk(join(ROOT, "src", "app"), files);
    walk(join(ROOT, "src", "components"), files);
    walk(join(ROOT, "src", "lib", "product-config"), files);
    const hits: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file);
      if (rel.endsWith(".test.ts")) continue;
      const text = readFileSync(file, "utf8");
      if (text.includes("Application Summary")) {
        hits.push(rel);
      }
    }
    expect(hits).toEqual([]);
  });
});

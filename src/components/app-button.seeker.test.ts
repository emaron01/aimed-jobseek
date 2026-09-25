import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const ALLOWED = new Set([
  join(ROOT, "src/components/AppButton.tsx"),
]);

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "platform") continue;
      walk(full, files);
      continue;
    }
    if (full.endsWith(".tsx") || full.endsWith(".ts")) files.push(full);
  }
  return files;
}

describe("seeker-facing button standard", () => {
  it("fails if a seeker-facing component renders a raw button or submit outside AppButton", () => {
    const files = [
      ...walk(join(ROOT, "src/components")),
      ...walk(join(ROOT, "src/app/(app)")),
      ...walk(join(ROOT, "src/app/(auth)")),
    ];
    const offenders: string[] = [];
    for (const file of files) {
      if (ALLOWED.has(file) || file.endsWith("app-button.seeker.test.ts")) continue;
      const source = readFileSync(file, "utf8");
      if (/<button\b/.test(source) || /createElement\(\s*["']button["']/.test(source)) {
        offenders.push(file.replace(`${ROOT}\\`, "").replace(`${ROOT}/`, ""));
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * Guard: primary/secondary button chrome must come from shared ui classes.
 * Same idea as the server-only CLI boundary tests — conventions that cannot
 * silently drift via copy-paste.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src");
const ALLOWED_FILES = new Set([
  "components/ui.tsx",
  // One-shot migration helper; not shipped UI.
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules") continue;
      out.push(...walk(p));
    } else if (name.endsWith(".tsx") || name.endsWith(".ts")) {
      out.push(p);
    }
  }
  return out;
}

function stringLiterals(source: string): string[] {
  const out: string[] = [];
  const re = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const quote = match[1]!;
    const value = match[2]!;
    if (quote === "`" && value.includes("${")) continue;
    out.push(value);
  }
  return out;
}

function isPrimaryButtonLiteral(value: string): boolean {
  if (value.includes("bg-slate-900/")) return false;
  return (
    value.includes("bg-slate-900") &&
    value.includes("font-medium") &&
    value.includes("text-white")
  );
}

function isSecondaryButtonLiteral(value: string): boolean {
  if (value.includes("outline-none") || value.includes("focus:ring")) {
    return false;
  }
  if (value.includes("placeholder:")) return false;
  if (value.includes("border-dashed")) return false;
  if (value.includes("resize-")) return false;
  // Form fields / panels without button intent
  if (
    value.includes("w-full") &&
    value.includes("text-slate-900") &&
    !value.includes("font-medium")
  ) {
    return false;
  }
  return (
    value.includes("border-slate-300") &&
    value.includes("bg-white") &&
    value.includes("font-medium")
  );
}

describe("button class boundary", () => {
  it("forbids inline primary/secondary button chrome outside ui.tsx", () => {
    const offenders: string[] = [];

    for (const abs of walk(ROOT)) {
      const rel = relative(ROOT, abs).replace(/\\/g, "/");
      if (ALLOWED_FILES.has(rel)) continue;
      if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;

      const source = readFileSync(abs, "utf8");
      for (const literal of stringLiterals(source)) {
        if (isPrimaryButtonLiteral(literal)) {
          offenders.push(`${rel}: primary «${literal.slice(0, 80)}…»`);
        }
        if (isSecondaryButtonLiteral(literal)) {
          offenders.push(`${rel}: secondary «${literal.slice(0, 80)}…»`);
        }
      }
    }

    expect(
      offenders,
      offenders.length
        ? `Use PRIMARY_BUTTON_CLASS / SECONDARY_BUTTON_CLASS / SECONDARY_CHIP_CLASS from @/components/ui instead of inline chrome:\n${offenders.join("\n")}`
        : undefined,
    ).toEqual([]);
  });

  it("defines shared button classes in AppButton and re-exports them from ui", () => {
    const ui = readFileSync(join(ROOT, "components/ui.tsx"), "utf8");
    const buttons = readFileSync(join(ROOT, "components/AppButton.tsx"), "utf8");
    expect(ui).toContain("PRIMARY_BUTTON_CLASS");
    expect(ui).toContain("SECONDARY_BUTTON_CLASS");
    expect(ui).toContain("SECONDARY_CHIP_CLASS");
    expect(buttons).toContain("export const PRIMARY_BUTTON_CLASS");
    expect(buttons).toContain("bg-slate-900");
    expect(buttons).toContain("border-slate-300");
    expect(buttons).toContain("export const SECONDARY_BUTTON_CLASS");
    expect(buttons).toContain("export const SECONDARY_CHIP_CLASS");
  });
});

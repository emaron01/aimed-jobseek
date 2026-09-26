import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  designTokens,
  WCAG_AA_NORMAL_TEXT,
} from "@/lib/product-config/design-tokens";

const ROOT = join(process.cwd(), "src");
const ALLOW_BUTTON_FILES = new Set([
  "components/AppButton.tsx",
]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "generated" || name === "platform") {
        continue;
      }
      walk(full, acc);
      continue;
    }
    if ((full.endsWith(".ts") || full.endsWith(".tsx")) && !full.includes(".test.")) {
      acc.push(full);
    }
  }
  return acc;
}

function seekerFiles(): string[] {
  return [
    ...walk(join(ROOT, "app", "(app)")),
    ...walk(join(ROOT, "components")),
  ];
}

describe("seeker-facing buttons", () => {
  it("uses AppButton or AppActionLink instead of raw buttons and class tokens", () => {
    const offenders: string[] = [];
    for (const file of seekerFiles()) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      const source = readFileSync(file, "utf8");
      if (
        !ALLOW_BUTTON_FILES.has(rel) &&
        /<button[\s>]/.test(source)
      ) {
        offenders.push(`${rel}: raw <button>`);
      }
      if (
        /<AppButton[\s\S]{0,400}className=\{[^}]*(PRIMARY_BUTTON_CLASS|SECONDARY_BUTTON_CLASS)/.test(
          source,
        )
      ) {
        offenders.push(`${rel}: AppButton still uses PRIMARY/SECONDARY_BUTTON_CLASS`);
      }
      if (
        /<(?:Link|a)\b[\s\S]{0,240}className=\{[^}]*(PRIMARY_BUTTON_CLASS|SECONDARY_BUTTON_CLASS)/.test(
          source,
        )
      ) {
        offenders.push(`${rel}: action link uses PRIMARY/SECONDARY_BUTTON_CLASS`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("gives every shared button variant AA contrast, including handoff and account", () => {
    const button = readFileSync("src/components/AppButton.tsx", "utf8");
    const menu = readFileSync("src/components/UserMenu.tsx", "utf8");
    const outreach = readFileSync(
      "src/components/ApplicationOutreachSections.tsx",
      "utf8",
    );
    expect(button).toContain('primary:');
    expect(button).toContain('secondary:');
    expect(button).toContain('danger:');
    expect(menu).toContain('variant="secondary"');
    expect(menu).toContain("data-testid=\"user-menu-trigger\"");
    expect(menu).toContain("bg-primary");
    expect(menu).toContain("text-on-primary");
    expect(outreach).toContain('variant="secondary"');
    expect(outreach).toContain("email-handoff");
    expect(
      contrastRatio(designTokens.color.onPrimary, designTokens.color.primary),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(
      contrastRatio(designTokens.color.ink, designTokens.color.surface),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(
      contrastRatio(designTokens.color.onInk, designTokens.color.danger),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(
      contrastRatio(designTokens.color.muted, designTokens.color.surface),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(
      contrastRatio(designTokens.color.onPrimary, designTokens.color.primary),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });
});

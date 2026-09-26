import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  designTokens,
  WCAG_AA_NORMAL_TEXT,
} from "@/lib/product-config/design-tokens";

const ROOT = join(process.cwd(), "src");
const ALLOWED_HEX = new Set([
  "lib/product-config/design-tokens.ts",
  "lib/product-config/design-tokens.test.ts",
  "lib/product-config/design-system.test.ts",
  "app/globals.css",
]);

const RAW_PALETTE =
  /\b(?:bg|text|border|ring|from|to|via|outline|decoration|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:\/[0-9]+)?\b/;

const HEX = /#(?:[0-9a-fA-F]{3,8})\b/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "generated") continue;
      out.push(...walk(p));
    } else if (name.endsWith(".tsx") || name.endsWith(".ts") || name.endsWith(".css")) {
      out.push(p);
    }
  }
  return out;
}

describe("design system tokens", () => {
  it("keeps seeker-facing chrome on token names, not raw palette colors", () => {
    const offenders: string[] = [];
    for (const abs of walk(ROOT)) {
      const rel = relative(ROOT, abs).replace(/\\/g, "/");
      if (ALLOWED_HEX.has(rel)) continue;
      if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
      if (rel.startsWith("lib/") && !rel.startsWith("lib/product-config/")) continue;
      const source = readFileSync(abs, "utf8");
      if (HEX.test(source) && (rel.endsWith(".tsx") || rel.endsWith(".css"))) {
        offenders.push(`${rel}: hex color`);
      }
      if (
        (rel.startsWith("components/") || rel.startsWith("app/")) &&
        RAW_PALETTE.test(source)
      ) {
        const match = source.match(RAW_PALETTE);
        offenders.push(`${rel}: ${match?.[0] ?? "palette class"}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("gives the referral control ink-on-surface contrast", () => {
    const source = readFileSync(
      join(ROOT, "components/billing/ReferAFriendButton.tsx"),
      "utf8",
    );
    expect(source).toContain('variant="secondary"');
    expect(source).not.toContain("SECONDARY_BUTTON_CLASS");
    expect(
      contrastRatio(designTokens.color.ink, designTokens.color.surface),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(
      contrastRatio(designTokens.color.onPrimary, designTokens.color.primary),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });
});

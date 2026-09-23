import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EULA_SEED_DATE_PLACEHOLDER,
  fillEulaSeedDate,
  INITIAL_EULA_CONTENT,
} from "@/lib/legal/eula-seed";

describe("eula seed content", () => {
  it("fills the date placeholder", () => {
    const filled = fillEulaSeedDate(
      INITIAL_EULA_CONTENT,
      new Date("2026-09-12T12:00:00.000Z"),
    );
    expect(filled).not.toContain(EULA_SEED_DATE_PLACEHOLDER);
    expect(filled).toContain("Last updated:");
    expect(filled).toContain("grants you a limited, non-exclusive");
    expect(filled).toMatch(/contact: \S+@\S+/);
  });
});

describe("eula gate wiring", () => {
  it("runs before checkout in app layout", () => {
    const layout = readFileSync("src/app/(app)/layout.tsx", "utf8");
    expect(layout).toContain("enforceEulaAcceptanceGate");
    expect(layout).toContain("enforceSelfServeCheckoutGate");
    const body = layout.slice(layout.indexOf("export default"));
    expect(body.indexOf("enforceEulaAcceptanceGate")).toBeLessThan(
      body.indexOf("enforceSelfServeCheckoutGate"),
    );
  });

  it("gates onboarding subscribe via layout", () => {
    const layout = readFileSync("src/app/(onboarding)/layout.tsx", "utf8");
    expect(layout).toContain("enforceEulaAcceptanceGate");
  });

  it("post-verify checks EULA before subscribe", () => {
    const page = readFileSync("src/app/(auth)/post-verify/page.tsx", "utf8");
    expect(page).toContain("userNeedsEulaAcceptance");
    expect(page).toContain("ONBOARDING_EULA_PATH");
    expect(page).toContain("ONBOARDING_SUBSCRIBE_PATH");
    const afterUser =
      page.slice(page.indexOf("const user = await getCurrentUser"));
    expect(afterUser.indexOf("userNeedsEulaAcceptance")).toBeLessThan(
      afterUser.indexOf("requiresStripeCheckout"),
    );
  });

  it("exempts EULA path from checkout and payment lock", () => {
    const gate = readFileSync("src/lib/billing/checkout-gate.ts", "utf8");
    const lock = readFileSync("src/lib/billing/payment-lock.ts", "utf8");
    const paths = readFileSync("src/lib/billing/paths.ts", "utf8");
    expect(paths).toContain('"/onboarding/eula"');
    expect(gate).toContain("ONBOARDING_EULA_PATH");
    expect(lock).toContain("/settings/billing");
    expect(lock).toContain("/onboarding/eula");
  });

  it("platform console lists EULA for super admins", () => {
    const nav = readFileSync("src/components/PlatformConsoleNav.tsx", "utf8");
    const audit = readFileSync("src/lib/platform/route-audit.ts", "utf8");
    const page = readFileSync("src/app/platform/eula/page.tsx", "utf8");
    expect(nav).toContain("/platform/eula");
    expect(audit).toContain("/platform/eula");
    expect(page).toContain("requirePlatformSuperAdmin");
  });
});

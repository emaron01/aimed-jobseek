import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { features } from "@/lib/product-config/features";
import {
  assertGatedAction,
  FeatureDisabledError,
  isGatedSurfaceEnabled,
  requireGatedPage,
} from "@/lib/product-config/feature-access";
import { harperActionTypesForStep } from "@/lib/product-config/harper-actions";
import { buildHomeSetupLine } from "@/lib/workflow/home-setup-line";
import { getProductCampaignReadiness } from "@/lib/workflow/product-campaign-readiness";
import { countedNoun, vocab } from "@/lib/product-config";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));

describe("employerIcpFit Phase A gate (flag off)", () => {
  it("defaults off", () => {
    expect(features.employerIcpFit).toBe(false);
    expect(isGatedSurfaceEnabled("employerIcpFit")).toBe(false);
  });

  it("pages require employerIcpFit and throw not found when off", () => {
    const pages = [
      "src/app/(app)/icps/page.tsx",
      "src/app/(app)/icps/new/page.tsx",
      "src/app/(app)/setup/[productId]/icps/page.tsx",
      "src/app/(app)/setup/[productId]/icps/new/page.tsx",
      "src/app/(app)/setup/[productId]/icps/[icpId]/page.tsx",
    ];
    for (const file of pages) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain('requireGatedPage("employerIcpFit")');
    }
    expect(() => requireGatedPage("employerIcpFit")).toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404/,
    );
  });

  it("actions assert employerIcpFit before paid ICP/fit work", () => {
    const gates: Array<[string, string]> = [
      ["src/app/actions.ts", "upsertIcpAction"],
      ["src/app/actions.ts", "deleteIcpAction"],
      ["src/app/actions/interpretation.ts", "previewStarterTargetEmployerAction"],
      ["src/app/actions/interpretation.ts", "approveStarterTargetEmployerAction"],
      ["src/app/actions/interpretation.ts", "interpretIcpAction"],
      ["src/app/actions/interpretation.ts", "updateIcpCriterionAction"],
      ["src/app/actions/interpretation.ts", "updateIcpEvidenceClassAction"],
      ["src/app/actions/interpretation.ts", "decideIcpTargetedSearchAction"],
      ["src/app/actions/interpretation.ts", "updateIcpCriterionTierAction"],
      ["src/app/actions/application.ts", "rescoreApplicationFitAction"],
      ["src/app/actions/application.ts", "overrideApplicationFitAction"],
      ["src/app/actions/scoring.ts", "createScoringRunAction"],
    ];
    for (const [file, action] of gates) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain(action);
      expect(source).toContain('assertGatedAction("employerIcpFit")');
    }
    expect(() => assertGatedAction("employerIcpFit")).toThrow(
      FeatureDisabledError,
    );
  });

  it("system paths skip fit scoring and ApplicationFit writes when off", () => {
    const finish = readFileSync("src/lib/application/research-finish.ts", "utf8");
    expect(finish).toContain('isGatedSurfaceEnabled("employerIcpFit")');
    expect(finish).toMatch(
      /if \(isGatedSurfaceEnabled\("employerIcpFit"\)\) \{\s*await scoreFit/,
    );
    expect(finish).toMatch(
      /export async function scoreFit[\s\S]*?if \(!isGatedSurfaceEnabled\("employerIcpFit"\)\) return/,
    );
    expect(finish).toMatch(
      /export async function markIdentityDependentsStale[\s\S]*?if \(!isGatedSurfaceEnabled\("employerIcpFit"\)\) return/,
    );
    const stale = readFileSync("src/lib/application/fit-staleness.ts", "utf8");
    expect(stale).toContain('if (!isGatedSurfaceEnabled("employerIcpFit")) return');
  });

  it("application workspace has no Scorecard display and hides Employer fit when off", () => {
    const workspace = readFileSync(
      "src/components/ApplicationJobBody.tsx",
      "utf8",
    );
    expect(workspace).toContain("features.employerIcpFit && icp");
    expect(workspace).toContain('data-testid="employer-fit"');
    expect(workspace).not.toContain('data-testid="scorecard-note"');
    expect(workspace).not.toContain("applicationWorkspaceCopy.scorecardTitle");
    const overview = readFileSync(
      "src/components/ApplicationOverview.tsx",
      "utf8",
    );
    expect(overview).toContain("features.employerIcpFit");
    expect(overview).toContain("applicationStepCopy.factFit");
  });

  it("setup omits Target Employer panel and complete-line ICP counts when off", () => {
    const setup = readFileSync(
      "src/app/(app)/setup/[productId]/page.tsx",
      "utf8",
    );
    expect(setup).toContain('isGatedSurfaceEnabled("employerIcpFit")');
    expect(setup).toContain("2. ${vocab.icp.singular}");
    const ready = getProductCampaignReadiness({
      approvalStatus: "APPROVED",
      icps: [{ criteria: [{}] }],
      personas: [{}],
    });
    const line = buildHomeSetupLine({
      products: [{ name: "Profile", readiness: ready }],
      totalIcps: 3,
      totalPersonas: 2,
    });
    expect(line.text).toBe(
      `Setup complete · ${countedNoun(1, vocab.product)} · ${countedNoun(2, vocab.persona)}`,
    );
    expect(line.text).not.toContain(vocab.icp.singular);
  });

  it("Harper job step does not suggest review_fit when flag is off", () => {
    expect(harperActionTypesForStep("job")).toEqual([
      "review_job",
      "start_consultation",
    ]);
    expect(harperActionTypesForStep("job")).not.toContain("review_fit");
  });

  it("hides seeker controls that call gated ICP/fit actions or link to gated pages", () => {
    const home = readFileSync("src/app/(app)/page.tsx", "utf8");
    expect(home).not.toContain("vocab.icp");
    expect(home).toContain("is approved. Voice samples are optional.");

    const listDetail = readFileSync("src/app/(app)/lists/[id]/page.tsx", "utf8");
    expect(listDetail).toContain(
      "features.listBulkScoring && features.employerIcpFit",
    );

    const scorePage = readFileSync(
      "src/app/(app)/lists/[id]/score/page.tsx",
      "utf8",
    );
    expect(scorePage).toContain('requireGatedPage("employerIcpFit")');
    const scoringRun = readFileSync(
      "src/app/(app)/scoring/[runId]/page.tsx",
      "utf8",
    );
    expect(scoringRun).toContain('requireGatedPage("employerIcpFit")');

    const buttons = readFileSync(
      "src/components/CampaignListWorkflowButtons.tsx",
      "utf8",
    );
    expect(buttons).toContain(
      "features.listBulkScoring && features.employerIcpFit",
    );

    const products = readFileSync("src/app/(app)/products/page.tsx", "utf8");
    expect(products).toContain("features.employerIcpFit");
    expect(products).not.toMatch(
      /description=\{`Define \$\{vocab\.product\.aSingular\}, then attach \$\{vocab\.icp\.plural\}/,
    );

    const research = readFileSync(
      "src/app/(app)/setup/[productId]/research/page.tsx",
      "utf8",
    );
    expect(research).toContain("features.employerIcpFit");
    expect(research).toContain(
      `Review the \${vocab.product.singular}. Approve it.`,
    );

    const catalog = readFileSync(
      "src/components/ProductCatalogPanel.tsx",
      "utf8",
    );
    expect(catalog).toContain("features.employerIcpFit");

    // Action-bound forms live only on page-gated ICP routes.
    expect(
      readFileSync("src/components/IcpDetailsForm.tsx", "utf8"),
    ).toContain("previewStarterTargetEmployerAction");
    for (const page of [
      "src/app/(app)/setup/[productId]/icps/new/page.tsx",
      "src/app/(app)/setup/[productId]/icps/[icpId]/page.tsx",
      "src/app/(app)/setup/[productId]/icps/page.tsx",
    ]) {
      expect(readFileSync(page, "utf8")).toContain(
        'requireGatedPage("employerIcpFit")',
      );
    }
  });

  it("onboarding and setup complete with no Target Employer step when flag is off", () => {
    const ready = getProductCampaignReadiness({
      approvalStatus: "APPROVED",
      icps: [],
      personas: [],
    });
    expect(ready.ready).toBe(true);
    expect(ready.omissionReason).toBeNull();

    const rail = readFileSync("src/lib/workflow/home-setup-rail.ts", "utf8");
    expect(rail).not.toContain('href: "/icps"');
    expect(rail).not.toContain("/icps/");

    const home = readFileSync("src/lib/workflow/home.ts", "utf8");
    expect(home).toContain(
      "Same rule as New campaign / setupComplete: approved Personal Profile",
    );

    // Onboarding routes have no Target Employer / ICP UI.
    const walk = (dir: string, out: string[] = []) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path, out);
        else if (path.endsWith(".tsx")) out.push(path);
      }
      return out;
    };
    for (const file of walk("src/app/(onboarding)/onboarding")) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("/icps");
      expect(source).not.toContain("previewStarterTargetEmployer");
      expect(source).not.toContain("upsertIcpAction");
      expect(source).not.toContain(vocab.icp.singular);
    }
  });

  it("does not delete ICP interpretation or fit modules", () => {
    expect(
      readFileSync("src/lib/interpretation/icp.ts", "utf8"),
    ).toContain("generateIcpInterpretation");
    expect(
      readFileSync("src/lib/application/fit.ts", "utf8"),
    ).toContain("computeApplicationEmployerFit");
  });
});

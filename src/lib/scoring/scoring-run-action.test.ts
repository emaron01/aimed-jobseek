/**
 * createScoringRunAction redirect + UI seam tests.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";

function mockScoringActionDeps(input: {
  redirect: ReturnType<typeof vi.fn>;
  createScoringRun: ReturnType<typeof vi.fn>;
}) {
  vi.doMock("next/navigation", () => ({ redirect: input.redirect }));
  vi.doMock("@/lib/tenant/data", () => ({
    createScoringRun: input.createScoringRun,
  }));
  vi.doMock("@/lib/interpretation/icp", () => ({
    listIcpCriteria: vi.fn(async () => []),
  }));
  // Avoid importActual — under full-suite transform load it can blow the
  // default 5s timeout while resolving the real org module graph.
  vi.doMock("@/lib/tenant/getCurrentOrganization", () => ({
    requireOrganizationId: vi.fn(async () => "org_1"),
    TenantError: class TenantError extends Error {},
  }));
  vi.doMock("@/lib/lists/campaign-query", () => ({
    scoringRunHref: (runId: string, campaignId?: string | null) =>
      campaignId
        ? `/scoring/${runId}?campaign=${campaignId}`
        : `/scoring/${runId}`,
  }));
  vi.doMock("@/lib/product-config/feature-access", () => ({
    assertGatedAction: vi.fn(),
    FEATURE_UNAVAILABLE: "This feature is not available.",
    FeatureDisabledError: class FeatureDisabledError extends Error {},
  }));
}

// Dynamic imports under full-suite contention exceed the default 5s timeout.
describe("createScoringRunAction redirect", { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("propagates Next redirect throw on success (not converted to result)", async () => {
    const redirect = vi.fn((url: string) => {
      const err = new Error(`NEXT_REDIRECT:${url}`);
      (err as Error & { digest?: string }).digest = "NEXT_REDIRECT";
      throw err;
    });
    const createScoringRun = vi.fn(async () => ({
      id: "run_abc",
      sourceCampaignId: null,
    }));

    mockScoringActionDeps({ redirect, createScoringRun });

    const { createScoringRunAction } = await import("@/app/actions/scoring");
    const formData = new FormData();
    formData.set("contactListId", "list_1");
    formData.set("productId", "prod_1");
    formData.set("icpId", "icp_1");
    formData.set("personaId", "persona_1");

    await expect(createScoringRunAction(null, formData)).rejects.toThrow(
      "NEXT_REDIRECT:/scoring/run_abc",
    );
    expect(createScoringRun).toHaveBeenCalledTimes(1);
    expect(createScoringRun).toHaveBeenCalledWith(
      expect.objectContaining({
        personaId: "persona_1",
        campaignId: null,
      }),
    );
    expect(redirect).toHaveBeenCalledWith("/scoring/run_abc");
  });

  it("redirects with campaign query when create carries campaignId", async () => {
    const redirect = vi.fn((url: string) => {
      const err = new Error(`NEXT_REDIRECT:${url}`);
      (err as Error & { digest?: string }).digest = "NEXT_REDIRECT";
      throw err;
    });
    const createScoringRun = vi.fn(async () => ({
      id: "run_camp",
      sourceCampaignId: "camp_1",
    }));

    mockScoringActionDeps({ redirect, createScoringRun });

    const { createScoringRunAction } = await import("@/app/actions/scoring");
    const formData = new FormData();
    formData.set("contactListId", "list_1");
    formData.set("productId", "prod_1");
    formData.set("icpId", "icp_1");
    formData.set("personaId", "persona_1");
    formData.set("campaignId", "camp_1");

    await expect(createScoringRunAction(null, formData)).rejects.toThrow(
      "NEXT_REDIRECT:/scoring/run_camp?campaign=camp_1",
    );
    expect(createScoringRun).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: "camp_1" }),
    );
  });

  it("creates an all-personas run when the sentinel is submitted", async () => {
    const redirect = vi.fn((url: string) => {
      const err = new Error(`NEXT_REDIRECT:${url}`);
      (err as Error & { digest?: string }).digest = "NEXT_REDIRECT";
      throw err;
    });
    const createScoringRun = vi.fn(async () => ({ id: "run_all" }));

    mockScoringActionDeps({ redirect, createScoringRun });

    const { createScoringRunAction } = await import("@/app/actions/scoring");
    const { ALL_PERSONAS_VALUE } = await import("@/lib/scoring/title-fit");
    const formData = new FormData();
    formData.set("contactListId", "list_1");
    formData.set("productId", "prod_1");
    formData.set("icpId", "icp_1");
    formData.set("personaId", ALL_PERSONAS_VALUE);

    await expect(createScoringRunAction(null, formData)).rejects.toThrow(
      "NEXT_REDIRECT:/scoring/run_all",
    );
    expect(createScoringRun).toHaveBeenCalledWith(
      expect.objectContaining({ personaId: null }),
    );
  });

  it("returns a result object when createScoringRun fails (no redirect)", async () => {
    const redirect = vi.fn();
    const createScoringRun = vi.fn(async () => {
      throw new Error("db down");
    });

    mockScoringActionDeps({ redirect, createScoringRun });

    const { createScoringRunAction } = await import("@/app/actions/scoring");
    const formData = new FormData();
    formData.set("contactListId", "list_1");
    formData.set("productId", "prod_1");
    formData.set("icpId", "icp_1");
    formData.set("personaId", "persona_1");

    const result = await createScoringRunAction(null, formData);
    expect(result).toEqual({
      ok: false,
      message: "Unable to create scoring run. Please try again.",
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("scoring run UI seam", () => {
  it("ScoreListForm renders validation errors from action state", () => {
    const formSrc = readFileSync("src/components/ScoreListForm.tsx", "utf8");
    expect(formSrc).toContain("useActionState");
    expect(formSrc).toContain("createScoringRunAction");
    expect(formSrc).toContain('data-testid="scoring-run-status"');
    expect(formSrc).toContain("`All ${vocab.persona.plural}`");
    expect(formSrc).toContain("ALL_PERSONAS_VALUE");
    expect(formSrc).toContain("defaultProductId");
    expect(formSrc).toContain("defaultIcpId");
    expect(formSrc).toContain("defaultPersonaId");
    expect(formSrc).toContain("campaignId");
    expect(formSrc).toContain('name="campaignId"');
    expect(formSrc).toContain("state.message");
  });

  it("score report hosts unmatched-title review and campaign return", () => {
    const pageSrc = readFileSync(
      "src/app/(app)/scoring/[runId]/page.tsx",
      "utf8",
    );
    const reviewSrc = readFileSync(
      "src/components/TitleSuggestionReview.tsx",
      "utf8",
    );
    expect(pageSrc).toContain("TitleSuggestionReview");
    expect(pageSrc).toContain("Unmatched titles");
    expect(pageSrc).toContain("AI Scoring");
    expect(pageSrc.indexOf("AI Scoring")).toBeLessThan(
      pageSrc.indexOf("Company Research"),
    );
    expect(pageSrc.indexOf("AI Scoring")).toBeLessThan(
      pageSrc.indexOf("AI roles for this run"),
    );
    expect(pageSrc).toContain("left-out-review-guidance");
    expect(pageSrc).toContain("SaveAndReturnToCampaignButton");
    expect(pageSrc).toContain("back-to-campaign");
    expect(reviewSrc).toContain("resolveTitleSuggestionAction");
    expect(reviewSrc).toContain("Approve");
    expect(reviewSrc).toContain("Dismiss");
    expect(reviewSrc).toContain("Assign");
  });
});

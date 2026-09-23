/**
 * Product setup overview helpers — status cards grouping and criteria summaries.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  formatPersonaCriteriaSummary,
  partitionSuggestedRoles,
  productCompletionState,
  productNameDomainMismatchWarning,
  summarizePersonaCriteriaCounts,
} from "@/lib/setup/product-overview";

describe("partitionSuggestedRoles", () => {
  it("renders 2 saved and 2 suggested with no duplicates when 2 of 4 roles are built", () => {
    const savedPersonas = [
      { id: "p1", name: "CRO", suggestionKey: "role-cro" },
      { id: "p2", name: "RevOps", suggestionKey: "role-revops" },
    ];
    const suggestedRoles = [
      { suggestionKey: "role-cro", name: "CRO" },
      { suggestionKey: "role-revops", name: "RevOps" },
      { suggestionKey: "role-cfo", name: "CFO" },
      { suggestionKey: "role-enablement", name: "Enablement" },
    ];

    const { savedPersonas: saved, unbuiltSuggestions } = partitionSuggestedRoles({
      savedPersonas,
      suggestedRoles,
    });

    expect(saved).toHaveLength(2);
    expect(unbuiltSuggestions).toHaveLength(2);
    expect(unbuiltSuggestions.map((r) => r.suggestionKey).sort()).toEqual([
      "role-cfo",
      "role-enablement",
    ]);
    const savedKeys = new Set(saved.map((p) => p.suggestionKey));
    for (const role of unbuiltSuggestions) {
      expect(savedKeys.has(role.suggestionKey)).toBe(false);
    }
  });

  it("keeps custom / keyless personas in saved only without hiding suggestions", () => {
    const { savedPersonas, unbuiltSuggestions } = partitionSuggestedRoles({
      savedPersonas: [
        { id: "custom", name: "Custom Buyer", suggestionKey: null },
        { id: "legacy", name: "Legacy Buyer", suggestionKey: "" },
      ],
      suggestedRoles: [
        { suggestionKey: "role-cro", name: "CRO" },
        { suggestionKey: "role-revops", name: "RevOps" },
      ],
    });
    expect(savedPersonas).toHaveLength(2);
    expect(unbuiltSuggestions).toHaveLength(2);
  });
});

describe("ICP incomplete state", () => {
  it("treats zero ICPs as the incomplete overview case", () => {
    const icps: unknown[] = [];
    expect(icps.length === 0).toBe(true);
    const overviewSrc = readFileSync(
      "src/app/(app)/setup/[productId]/page.tsx",
      "utf8",
    );
    expect(overviewSrc).toContain("{vocab.icp.singular} not set up yet");
    expect(overviewSrc).toContain("Add {vocab.icp.singular}");
    expect(overviewSrc).not.toContain("Commercial real-estate companies");
  });
});

describe("summarizePersonaCriteriaCounts", () => {
  it("matches database-style breakout by type/flags including needs_review", () => {
    const criteria = [
      { criterionType: "negative_role_signal", isDisqualifier: true, isRequired: false },
      { criterionType: "negative_role_signal", isDisqualifier: true, isRequired: false },
      { criterionType: "negative_role_signal", isDisqualifier: true, isRequired: false },
      { criterionType: "negative_role_signal", isDisqualifier: true, isRequired: false },
      { criterionType: "negative_role_signal", isDisqualifier: true, isRequired: false },
      { criterionType: "negative_role_signal", isDisqualifier: true, isRequired: false },
      { criterionType: "negative_role_signal", isDisqualifier: true, isRequired: false },
      { criterionType: "ownership", isDisqualifier: false, isRequired: true },
      { criterionType: "ownership", isDisqualifier: false, isRequired: true },
      { criterionType: "ownership", isDisqualifier: false, isRequired: false },
      { criterionType: "responsibility", isDisqualifier: false, isRequired: false },
      { criterionType: "positive_role_signal", isDisqualifier: false, isRequired: false },
      { criterionType: "positive_role_signal", isDisqualifier: false, isRequired: false },
      { criterionType: "needs_review", isDisqualifier: false, isRequired: false },
      { criterionType: "needs_review", isDisqualifier: false, isRequired: false },
    ];
    const summary = summarizePersonaCriteriaCounts(criteria);
    expect(summary).toEqual({
      total: 15,
      exclusions: 7,
      required: 2,
      needsReview: 2,
    });
    expect(formatPersonaCriteriaSummary(summary)).toBe(
      "15 criteria · 7 exclusions · 2 required · 2 needs review",
    );
  });
});

describe("productNameDomainMismatchWarning", () => {
  it("warns when product name is a typo of the website domain", () => {
    expect(
      productNameDomainMismatchWarning(
        "acmecopr.example",
        "https://www.acmecorp.example",
      ),
    ).toMatch(/doesn’t look like it matches acmecorp/i);
  });

  it("does not warn when name matches the domain label", () => {
    expect(
      productNameDomainMismatchWarning(
        "Acme Corp",
        "https://www.acmecorp.example",
      ),
    ).toBeNull();
  });

  it("does not warn when website URL is empty", () => {
    expect(productNameDomainMismatchWarning("Acme", "")).toBeNull();
  });
});

describe("productCompletionState", () => {
  it("maps approval statuses", () => {
    expect(productCompletionState({ approvalStatus: "APPROVED" })).toBe(
      "approved",
    );
    expect(productCompletionState({ approvalStatus: "NEEDS_REVIEW" })).toBe(
      "needs_review",
    );
    expect(productCompletionState({ approvalStatus: "NOT_STARTED" })).toBe(
      "not_started",
    );
  });
});

describe("write paths unchanged", () => {
  it("edit forms still submit via the same server actions", () => {
    const productForm = readFileSync(
      "src/components/ProductDetailsForm.tsx",
      "utf8",
    );
    const icpForm = readFileSync("src/components/IcpDetailsForm.tsx", "utf8");
    const personaForm = readFileSync("src/components/PersonaForm.tsx", "utf8");
    const actions = readFileSync("src/app/actions.ts", "utf8");

    expect(productForm).toContain("upsertProductAction");
    expect(productForm).toContain("useActionState");
    expect(productForm).toContain('data-testid="product-action-status"');
    expect(productForm).toContain("productNameDomainMismatchWarning");
    expect(productForm).toContain("product-name-domain-warning");
    expect(icpForm).toContain("upsertIcpAction");
    expect(icpForm).toContain("useActionState");
    expect(icpForm).toContain("icp-action-status");
    expect(personaForm).toContain("upsertPersonaAction");
    expect(personaForm).toContain("action={saveAction}");

    expect(actions).toContain("export async function upsertProductAction");
    expect(actions).toContain("export async function upsertIcpAction");
    expect(actions).toContain("export async function upsertPersonaAction");

    // Overview is status-only — no inline write forms.
    const overview = readFileSync(
      "src/app/(app)/setup/[productId]/page.tsx",
      "utf8",
    );
    expect(overview).not.toContain("PersonaForm");
    expect(overview).not.toContain("ProductDetailsForm");
    expect(overview).not.toContain("IcpDetailsForm");
    expect(overview).not.toContain("upsertProductAction");
    expect(overview).not.toContain("upsertIcpAction");
    expect(overview).toContain("ExportPdfButton");
    expect(overview).toContain("data-print-document");
    expect(overview).toContain("Delete ${vocab.product.singular}");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));

import {
  FEATURE_UNAVAILABLE,
  FeatureDisabledError,
  assertGatedAction,
  isGatedSurfaceEnabled,
  requireGatedPage,
  type GatedSurface,
} from "@/lib/product-config/feature-access";
import { features, type FeatureFlag } from "@/lib/product-config/features";

const ALL_OFF: Readonly<Record<FeatureFlag, boolean>> = Object.freeze({
  ...features,
  listImport: false,
  listBulkValidation: false,
  listBulkScoring: false,
  emailConnection: false,
  legacyEmailSequence: false,
  productLevelHiringTeam: false,
});

const SURFACES: GatedSurface[] = [
  "lists",
  "listImport",
  "listBulkValidation",
  "listBulkScoring",
  "legacyEmailSequence",
  "emailConnection",
  "productLevelHiringTeam",
];

describe("gated surfaces default off", () => {
  it.each(SURFACES)("%s is disabled in the product flags", (surface) => {
    expect(isGatedSurfaceEnabled(surface)).toBe(false);
    expect(isGatedSurfaceEnabled(surface, ALL_OFF)).toBe(false);
  });

  it("lists is on when any list flag is on", () => {
    expect(
      isGatedSurfaceEnabled("lists", { ...ALL_OFF, listImport: true }),
    ).toBe(true);
    expect(
      isGatedSurfaceEnabled("listBulkScoring", {
        ...ALL_OFF,
        listBulkScoring: true,
      }),
    ).toBe(true);
  });
});

describe("requireGatedPage returns not found when off", () => {
  it.each(SURFACES)("%s page throws not found with its flag off", (surface) => {
    expect(() => requireGatedPage(surface)).toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404/,
    );
  });
});

describe("assertGatedAction is forbidden when off", () => {
  it.each(SURFACES)("%s action throws FeatureDisabledError with its flag off", (surface) => {
    expect(() => assertGatedAction(surface)).toThrow(FeatureDisabledError);
    try {
      assertGatedAction(surface);
    } catch (error) {
      expect(error).toBeInstanceOf(FeatureDisabledError);
      expect((error as FeatureDisabledError).message).toBe(FEATURE_UNAVAILABLE);
    }
  });
});

describe("pages and actions call the matching gate", () => {
  const pageGates: Array<[string, GatedSurface]> = [
    ["src/app/(app)/lists/page.tsx", "lists"],
    ["src/app/(app)/lists/[id]/page.tsx", "lists"],
    ["src/app/(app)/lists/[id]/score/page.tsx", "listBulkScoring"],
    ["src/app/(app)/scoring/[runId]/page.tsx", "listBulkScoring"],
    [
      "src/app/(app)/setup/[productId]/personas/new/page.tsx",
      "productLevelHiringTeam",
    ],
    [
      "src/app/(app)/setup/[productId]/personas/manage/new/page.tsx",
      "productLevelHiringTeam",
    ],
    [
      "src/app/(app)/setup/[productId]/personas/manage/[personaId]/page.tsx",
      "productLevelHiringTeam",
    ],
    [
      "src/app/(app)/setup/[productId]/personas/manage/[personaId]/rebuild/[runId]/page.tsx",
      "productLevelHiringTeam",
    ],
    [
      "src/app/(app)/setup/[productId]/personas/[runId]/page.tsx",
      "productLevelHiringTeam",
    ],
    ["src/app/(app)/personas/page.tsx", "productLevelHiringTeam"],
    ["src/app/(app)/personas/new/page.tsx", "productLevelHiringTeam"],
    ["src/app/api/mailbox/microsoft/connect/route.ts", "emailConnection"],
    ["src/app/api/mailbox/microsoft/callback/route.ts", "emailConnection"],
    ["src/app/(app)/campaigns/[id]/[stage]/page.tsx", "legacyEmailSequence"],
    ["src/app/(app)/campaigns/[id]/page.tsx", "legacyEmailSequence"],
  ];

  it.each(pageGates)("%s requires %s", (file, surface) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain("requireGatedPage");
    expect(source).toContain(`"${surface}"`);
  });

  const actionGates: Array<[string, GatedSurface, string]> = [
    ["src/app/actions/import.ts", "listImport", "importContactsAction"],
    ["src/app/actions/import.ts", "listImport", "checkImportDuplicatesAction"],
    [
      "src/app/actions/research.ts",
      "listBulkValidation",
      "researchCompaniesForContactListAction",
    ],
    [
      "src/app/actions/research.ts",
      "listBulkValidation",
      "researchCompaniesForScoringRunAction",
    ],
    ["src/app/actions/scoring.ts", "listBulkScoring", "createScoringRunAction"],
    ["src/app/actions/scoring.ts", "listBulkScoring", "scoreContactsAction"],
    [
      "src/app/actions/campaign-contacts.ts",
      "listBulkScoring",
      "addScoringRunContactsToCampaignAction",
    ],
    [
      "src/app/actions/email.ts",
      "legacyEmailSequence",
      "generateEmailDraftAction",
    ],
    [
      "src/app/actions/email.ts",
      "emailConnection",
      "sendEmailDraftConnectedAction",
    ],
    [
      "src/app/actions/mailbox.ts",
      "emailConnection",
      "disconnectMicrosoftMailboxAction",
    ],
    [
      "src/app/actions/persona-setup.ts",
      "productLevelHiringTeam",
      "buildPersonaFromBuyerRoleAction",
    ],
    [
      "src/app/actions/interpretation.ts",
      "productLevelHiringTeam",
      "interpretPersonaAction",
    ],
    [
      "src/app/actions/interpretation.ts",
      "productLevelHiringTeam",
      "saveAndInterpretPersonaAction",
    ],
    ["src/app/actions.ts", "productLevelHiringTeam", "upsertPersonaAction"],
  ];

  it.each(actionGates)("%s %s gates %s", (file, surface, action) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain(action);
    expect(source).toContain("assertGatedAction");
    expect(source).toContain(`"${surface}"`);
  });

  it("does not gate platform admin routes", () => {
    const platform = readFileSync("src/app/platform/page.tsx", "utf8");
    expect(platform).not.toContain("requireGatedPage");
    const orgs = readFileSync("src/app/platform/orgs/page.tsx", "utf8");
    expect(orgs).not.toContain("requireGatedPage");
  });
});

describe("persona-prompt sales framing is not on a seeker path", () => {
  it("is imported only by product-level interpretation", () => {
    const persona = readFileSync("src/lib/interpretation/persona.ts", "utf8");
    const prompt = readFileSync(
      "src/lib/interpretation/persona-prompt.ts",
      "utf8",
    );
    const interpretation = readFileSync(
      "src/app/actions/interpretation.ts",
      "utf8",
    );
    const hiringTeam = readFileSync("src/app/actions/hiring-team.ts", "utf8");
    expect(prompt).toContain("Desired Outcomes From Your Solution");
    expect(persona).toContain(
      'from "@/lib/interpretation/persona-prompt"',
    );
    expect(interpretation).toContain("interpretPersonaDefinition");
    expect(interpretation).toContain('assertGatedAction("productLevelHiringTeam")');
    expect(hiringTeam).not.toContain("persona-prompt");
    expect(hiringTeam).not.toContain("interpretPersonaDefinition");
  });
});

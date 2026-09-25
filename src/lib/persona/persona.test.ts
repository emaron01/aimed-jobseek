/**
 * Persona save + interpretation semantics regression tests.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildLegacyPersonaCriteria } from "@/lib/criteria/legacy-backfill";
import { planCriterionReinterpretation } from "@/lib/criteria/merge";
import { PERSONA_INTERPRETATION_PROMPT_VERSION } from "@/lib/criteria/types";
import {
  buildPersonaInterpretationMessages,
  personaInterpretationPayloadHasCampaignContamination,
} from "@/lib/interpretation/persona-prompt";
import { sanitizePersonaInterpretedCriteria } from "@/lib/interpretation/persona-sanitize";
import {
  decomposeProseIntoAtomicTargets,
  filterLiteralTitleEvidence,
  looksLikeCampaignCta,
} from "@/lib/persona/decompose";
import {
  parsePersonaFormData,
  toSafePersonaActionError,
} from "@/lib/persona/save";
import { TenantError } from "@/lib/tenant/errors";
import type { Persona } from "@prisma/client";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

/** Regression fixture modeled on the production Persona that exposed semantic bugs. */
const SALES_LEADER_FIXTURE = {
  name: "Sales leader — forecast owner",
  definition:
    "Sales leader responsible for 8–12 reps. Owns forecasting quality and coaching cadence.",
  additionalContext: "Enterprise B2B motion; CRM is Salesforce.",
  targetTitles: ["CRO", "VP Sales", "Director of Sales", "Sales leaders"],
  department: "Sales",
  seniority: "Director through C-Suite",
  responsibilities:
    "forecasting; deal inspection; coaching; qualification consistency",
  painPoints:
    "forecast calls consume time\nCRM data unreliable\ninconsistent qualification\nlate discovery of risk\nslipping commits\ninsufficient coaching capacity",
  desiredOutcomes:
    "reduce forecast administration\nincrease forecast confidence\nidentify risk earlier\nimprove qualification consistency\nincrease coaching time",
  messagingNotes: "Lead with time saved on forecast calls; avoid product jargon.",
};

function asPersona(partial: typeof SALES_LEADER_FIXTURE): Persona {
  return {
    id: "persona_fixture",
    organizationId: "org_fixture",
    productId: "product_fixture",
    campaignId: null,
    personaTemplateId: null,
    name: partial.name,
    definition: partial.definition,
    additionalContext: partial.additionalContext,
    targetTitles: partial.targetTitles,
    department: partial.department,
    seniority: partial.seniority,
    responsibilities: partial.responsibilities,
    painPoints: partial.painPoints,
    desiredOutcomes: partial.desiredOutcomes,
    messagingNotes: partial.messagingNotes,
    interpretationVersion: 1,
    interpretationPromptVersion: null,
    lastInterpretedAt: null,
    approvalStatus: "NOT_STARTED",
    approvedAt: null,
    approvedByUserId: null,
    approvedEvidenceBundleId: null,
    approvedSetupRunId: null,
    manuallyEditedFields: null,
    suggestionKey: null,
    whyThisPersonaMatters: null,
    personaMessagingJson: null,
    profileJson: null,
    setupStatus: "NOT_STARTED",
    staleAt: null,
    staleReason: null,
    approvedPersonaSetupRunId: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("Persona field semantics", () => {
  it("Desired Outcomes UI describes what the Hiring Team role needs from the hire", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/components/PersonaForm.tsx", "utf8"),
    );
    expect(src).toContain("hiringTeamConfig.fields.outcomesLabel");
    expect(src).toContain("hiringTeamConfig.fields.outcomesHint");
    expect(src).not.toContain("vocab.solution.Singular");
    expect(src).not.toMatch(/label=\"Desired Outcomes\"/);
  });

  it("filters generic role labels from literal title evidence", () => {
    expect(
      filterLiteralTitleEvidence([
        "CRO",
        "VP Sales",
        "Director of Sales",
        "Sales leaders",
        "Sales Leader",
      ]),
    ).toEqual(["CRO", "VP Sales", "Director of Sales"]);
  });

  it("distinguishes department Sales from Sales Leader", () => {
    const drafts = buildLegacyPersonaCriteria(asPersona(SALES_LEADER_FIXTURE));
    const dept = drafts.find((d) => d.criterionType === "department");
    expect(dept?.targetValue).toBe("Sales");
    expect(String(dept?.targetValue)).not.toMatch(/Sales Leader/i);
  });

  it("does not treat Meeting/demo as desired solution outcome", () => {
    expect(looksLikeCampaignCta("Meeting/demo")).toBe(true);
    expect(looksLikeCampaignCta("reduce forecast administration")).toBe(false);

    const contaminated = sanitizePersonaInterpretedCriteria([
      {
        name: "Meeting/demo",
        criterionType: "desired_outcome",
        dataType: "TEXT",
        operator: "CONTAINS",
        targetValue: "Meeting/demo",
        importance: "HIGH",
        isRequired: false,
        isDisqualifier: false,
        sortOrder: 0,
      },
      {
        name: "Reduce forecast admin",
        criterionType: "desired_outcome",
        dataType: "TEXT",
        operator: "EXISTS",
        targetValue: "reduce forecast administration",
        importance: "HIGH",
        isRequired: false,
        isDisqualifier: false,
        sortOrder: 1,
      },
    ]);
    expect(contaminated.map((c) => c.targetValue)).toEqual([
      "reduce forecast administration",
    ]);
  });

  it("decomposes long pain/responsibility prose into concise criteria", () => {
    const atoms = decomposeProseIntoAtomicTargets(
      SALES_LEADER_FIXTURE.painPoints,
    );
    expect(atoms.length).toBeGreaterThan(3);
    expect(atoms.every((a) => a.length < 180)).toBe(true);
    expect(atoms.join(" ")).not.toContain("\n\n");

    const drafts = buildLegacyPersonaCriteria(asPersona(SALES_LEADER_FIXTURE));
    const pains = drafts.filter((d) => d.criterionType === "pain");
    expect(pains.length).toBeGreaterThan(3);
    expect(
      pains.every((p) => String(p.targetValue ?? "").length < 180),
    ).toBe(true);

    const outcomes = drafts.filter((d) => d.criterionType === "desired_outcome");
    expect(outcomes.some((o) => looksLikeCampaignCta(String(o.targetValue)))).toBe(
      false,
    );

    expect(drafts.some((d) => d.criterionType.includes("messaging"))).toBe(
      false,
    );
  });

  it("persona interpretation payload has no campaign CTA contamination", () => {
    const messages = buildPersonaInterpretationMessages({
      productName: "Forecast Platform",
      productDescription: "Helps revenue teams forecast accurately",
      fields: {
        name: SALES_LEADER_FIXTURE.name,
        definition: SALES_LEADER_FIXTURE.definition,
        additionalContext: SALES_LEADER_FIXTURE.additionalContext,
        targetTitles: SALES_LEADER_FIXTURE.targetTitles,
        department: SALES_LEADER_FIXTURE.department,
        seniority: SALES_LEADER_FIXTURE.seniority,
        responsibilities: SALES_LEADER_FIXTURE.responsibilities,
        painPoints: SALES_LEADER_FIXTURE.painPoints,
        desiredOutcomes: SALES_LEADER_FIXTURE.desiredOutcomes,
        messagingNotes: SALES_LEADER_FIXTURE.messagingNotes,
      },
      existingCriteria: [],
    });
    expect(PERSONA_INTERPRETATION_PROMPT_VERSION).toBe("2");
    expect(messages[0]!.content).toContain(
      "Desired Outcomes From Your Solution ≠ Campaign CTA",
    );
    expect(messages[0]!.content).toContain("Title Match ≠ Role Match");
    const userJson = messages[1]!.content;
    expect(
      personaInterpretationPayloadHasCampaignContamination(userJson),
    ).toBe(false);
    expect(userJson).toContain("desiredOutcomesFromYourSolution");
    expect(userJson).toContain("primaryResponsibilities");
    expect(userJson).not.toContain('"campaign"');
    expect(userJson).not.toContain("conversionGoal");
  });

  it("safe errors never expose Prisma/stack details", () => {
    expect(toSafePersonaActionError(new TenantError("Product is required."))).toBe(
      "Product is required.",
    );
    expect(
      toSafePersonaActionError(new Error("Unique constraint failed on name")),
    ).toMatch(/already exist/i);
    expect(
      toSafePersonaActionError(new Error("prisma.$queryRaw stack at /app")),
    ).toBe("Unable to save persona. Please try again.");
  });

  it("parsePersonaFormData persists all authoritative fields", () => {
    const fd = new FormData();
    fd.set("id", "");
    fd.set("productId", "prod_1");
    fd.set("name", SALES_LEADER_FIXTURE.name);
    fd.set("definition", SALES_LEADER_FIXTURE.definition);
    fd.set("additionalContext", SALES_LEADER_FIXTURE.additionalContext);
    fd.set("targetTitles", SALES_LEADER_FIXTURE.targetTitles.join(", "));
    fd.set("department", SALES_LEADER_FIXTURE.department);
    fd.set("seniority", SALES_LEADER_FIXTURE.seniority);
    fd.set("responsibilities", SALES_LEADER_FIXTURE.responsibilities);
    fd.set("painPoints", SALES_LEADER_FIXTURE.painPoints);
    fd.set("desiredOutcomes", SALES_LEADER_FIXTURE.desiredOutcomes);
    fd.set("messagingNotes", SALES_LEADER_FIXTURE.messagingNotes);

    const parsed = parsePersonaFormData(fd);
    expect(parsed.fields.name).toBe(SALES_LEADER_FIXTURE.name);
    expect(parsed.fields.desiredOutcomes).toBe(
      SALES_LEADER_FIXTURE.desiredOutcomes,
    );
    expect(parsed.fields.messagingNotes).toBe(
      SALES_LEADER_FIXTURE.messagingNotes,
    );
    expect(parsed.fields.targetTitles).toContain("CRO");
  });

  it("manual criterion edits survive reinterpretation planning", () => {
    const plan = planCriterionReinterpretation({
      existing: [
        {
          id: "manual_1",
          name: "Owns forecasting",
          criterionType: "responsibility",
          manuallyEdited: true,
        },
        {
          id: "ai_1",
          name: "Old AI pain blob",
          criterionType: "pain",
          manuallyEdited: false,
        },
      ],
      aiDrafts: [
        {
          name: "CRM data unreliable",
          criterionType: "pain",
          dataType: "TEXT",
          operator: "EXISTS",
          targetValue: "CRM data unreliable",
          importance: "MEDIUM",
          isRequired: false,
          isDisqualifier: false,
          sortOrder: 0,
        },
      ],
    });
    expect(plan.keepIds).toContain("manual_1");
    expect(plan.replaceNonManual).toBe(true);
  });

  it("splits giant AI CONTAINS targets into atomic criteria", () => {
    const giant = SALES_LEADER_FIXTURE.painPoints.repeat(3);
    const sanitized = sanitizePersonaInterpretedCriteria([
      {
        name: "Pain Relevance",
        criterionType: "pain",
        dataType: "TEXT",
        operator: "CONTAINS",
        targetValue: giant,
        importance: "MEDIUM",
        isRequired: false,
        isDisqualifier: false,
        sortOrder: 0,
      },
    ]);
    expect(sanitized.length).toBeGreaterThan(1);
    expect(sanitized.every((c) => String(c.targetValue).length <= 180)).toBe(
      true,
    );
  });
});

describe.skipIf(!hasDatabase)(
  "Persona save without AI",
  { timeout: 90_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    let organizationId = "";
    let productId = "";
    const suffix = Date.now().toString(36);

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT 1`;
        const org = await prisma.organization.create({
          data: {
            name: `[TEST] Persona Save Org ${suffix}`,
            slug: `persona-save-${suffix}`,
          },
        });
        organizationId = org.id;
        const product = await prisma.product.create({
          data: {
            organizationId,
            name: `Product ${suffix}`,
          },
        });
        productId = product.id;
        ready = true;
      } catch {
        console.warn("Skipping persona save DB tests.");
      }
    });

    afterAll(async () => {
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
      if (prisma) await prisma.$disconnect();
    });

    it("saves full authoritative Persona without interpretation AI", async () => {
      if (!ready) return;

      // Simulate tenant write path used by actions (org-scoped create)
      const persona = await prisma.persona.create({
        data: {
          organizationId,
          productId,
          name: `[TEST] ${SALES_LEADER_FIXTURE.name}`,
          definition: SALES_LEADER_FIXTURE.definition,
          additionalContext: SALES_LEADER_FIXTURE.additionalContext,
          targetTitles: SALES_LEADER_FIXTURE.targetTitles,
          department: SALES_LEADER_FIXTURE.department,
          seniority: SALES_LEADER_FIXTURE.seniority,
          responsibilities: SALES_LEADER_FIXTURE.responsibilities,
          painPoints: SALES_LEADER_FIXTURE.painPoints,
          desiredOutcomes: SALES_LEADER_FIXTURE.desiredOutcomes,
          messagingNotes: SALES_LEADER_FIXTURE.messagingNotes,
        },
      });

      const reloaded = await prisma.persona.findUniqueOrThrow({
        where: { id: persona.id },
      });
      expect(reloaded.desiredOutcomes).toBe(SALES_LEADER_FIXTURE.desiredOutcomes);
      expect(reloaded.department).toBe("Sales");
      expect(reloaded.messagingNotes).toContain("forecast calls");

      // Interpretation when AI unconfigured uses legacy atomic criteria
      vi.resetModules();
      process.env.INTERPRETATION_AI_PROVIDER = "";
      process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

      const drafts = buildLegacyPersonaCriteria(reloaded);
      expect(drafts.length).toBeGreaterThan(5);
      expect(
        drafts.every(
          (d) =>
            typeof d.targetValue !== "string" ||
            d.targetValue.length < 200 ||
            Array.isArray(d.targetValue),
        ),
      ).toBe(true);

      // Raw definition never overwritten by interpretation metadata alone
      expect(reloaded.definition).toBe(SALES_LEADER_FIXTURE.definition);
    });

    it("createPersona path requires product in active organization", async () => {
      if (!ready) return;
      const src = await import("node:fs").then((fs) =>
        fs.readFileSync("src/lib/tenant/data.ts", "utf8"),
      );
      expect(src).toMatch(/export async function createPersona[\s\S]*requireProductInOrg/);
      expect(src).toMatch(
        /export async function updatePersona[\s\S]*productId: existing\.productId/,
      );
    });
  },
);

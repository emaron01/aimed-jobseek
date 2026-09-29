import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NORMAL_JOB_MODEL, NORMAL_JOB_POSTING } from "@/lib/job-requirement/fixtures";
import { normalizeParsedJobRequirement } from "@/lib/job-requirement/normalize";
import { buildJobRequirementMessages } from "@/lib/job-requirement/prompt";
import { hasTestDatabase } from "@/test/database";

const interpretJobPosting = vi.hoisted(() => vi.fn());

vi.mock("@/lib/job-requirement/parse", () => ({
  interpretJobPosting,
}));

// This file's DB suite asserts ApplicationFit after posting save. Enable the
// Phase A flag for that path only (default in features.ts remains false).
vi.mock("@/lib/product-config/features", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-config/features")>();
  return {
    ...actual,
    features: Object.freeze({ ...actual.features, employerIcpFit: true }),
  };
});

describe("job requirements page", () => {
  const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
  const actions = readFileSync(
    "src/components/ApplicationJobRequirementActions.tsx",
    "utf8",
  );
  const applicationActions = readFileSync(
    "src/app/actions/application.ts",
    "utf8",
  );

  it("renders the job requirements once and has no field-by-field edit form", () => {
    expect(workspace).toContain("job-requirement-view");
    expect(workspace).toContain("ApplicationJobRequirementTopActions");
    expect(workspace).toContain("ApplicationJobRequirementActions");
    expect(workspace).not.toContain("ApplicationJobRequirementForm");
    expect(workspace.split("job-requirement-view").length).toBe(2);
    expect(actions).not.toContain('name="title"');
    expect(actions).not.toContain('name="responsibilities"');
    expect(actions).not.toContain('name="outcomes"');
  });

  it("edits the original posting and keeps learned notes collapsed, without Regenerate", () => {
    expect(actions).toContain("job-requirement-top-actions");
    expect(actions).toContain("job-learned-top");
    expect(actions).toContain("job-edit-top");
    expect(actions).toContain("openExistingSection(\"job-learned-notes\")");
    expect(actions).toContain("openExistingSection(\"edit-job-posting\")");
    expect(actions).toContain("edit-job-posting");
    expect(actions).toContain("saveApplicationJobPostingAction");
    expect(actions).not.toContain("regenerate-job-requirement");
    expect(actions).not.toContain("regenerateApplicationJobRequirementAction");
    expect(applicationActions).not.toContain(
      "regenerateApplicationJobRequirementAction",
    );
    expect(actions).toContain("job-learned-notes");
    expect(actions).toContain("<details");
    expect(actions).toContain("saveApplicationJobLearnedNotesAction");
  });

  it("does not render the Scorecard section or note on the Job Requirements page", () => {
    expect(workspace).not.toContain("criterionFlags.inference");
    expect(workspace).not.toContain("polishCopy.inferredLabel");
    expect(workspace).not.toContain("scorecard-note");
    expect(workspace).not.toContain("applicationWorkspaceCopy.scorecardNote");
    expect(workspace).not.toContain("applicationWorkspaceCopy.scorecardTitle");
    expect(workspace).not.toContain("applicationWorkspaceCopy.outcomesTitle");
    expect(workspace).not.toContain("applicationWorkspaceCopy.competenciesTitle");
    expect(workspace).not.toContain("applicationWorkspaceCopy.noMission");
    expect(workspace).not.toContain("ScorecardList");
    expect(workspace).not.toContain("readScorecard");
    expect(workspace).not.toContain("scorecardJson");
  });

  it("hides Employer fit behind employerIcpFit (no fit content without the flag)", () => {
    expect(workspace).toContain("features.employerIcpFit && icp");
    expect(workspace).toContain('data-testid="employer-fit"');
    const featuresSource = readFileSync(
      "src/lib/product-config/features.ts",
      "utf8",
    );
    expect(featuresSource).toMatch(/employerIcpFit:\s*false/);
  });

  it("shows a reason per employer-fit criterion and keeps override without a save button", () => {
    expect(workspace).toContain("fitCriterionReason");
    expect(workspace).toContain("employer-fit-criterion");
    expect(workspace).not.toContain("Your result:");
    expect(workspace).not.toContain("(scored");
    const override = readFileSync(
      "src/components/ApplicationFitOverride.tsx",
      "utf8",
    );
    expect(override).toContain("hideSubmit");
    expect(override).not.toContain('submitLabel="Save"');
  });

  it("includes learned notes in the job-requirement message builder (unused by live parse triggers)", () => {
    const messages = buildJobRequirementMessages(
      "Senior sales role",
      "The interviewer said the role is more security sales than general sales.",
    );
    const user = JSON.parse(messages[1]!.content);
    expect(user.seekerLearnedNotes).toContain("security sales");
    expect(user.instruction).toMatch(/notes/i);
  });

  it("keeps scorecardJson readers outside the Job Requirements page display", () => {
    const readers: Array<{ path: string; needle: string }> = [
      {
        path: "src/lib/hiring-team/build.ts",
        needle: "readScorecard(requirement.scorecardJson)",
      },
      {
        path: "src/lib/hiring-team/evidence.ts",
        needle: "job.scorecard.mission",
      },
      {
        path: "src/lib/hiring-team/draft-quality.ts",
        needle: "job.scorecard.mission",
      },
      {
        path: "src/lib/consultation/service.ts",
        needle: "readScorecard(requirement.scorecardJson)",
      },
      {
        path: "src/lib/consultation/assess.ts",
        needle: "input.scorecard.outcomes",
      },
      {
        path: "src/lib/generation/context.ts",
        needle: "scorecard: requirement.scorecardJson",
      },
      {
        path: "src/lib/application-assets/prompt.ts",
        needle: "scorecard: requirement.scorecard",
      },
      {
        path: "src/lib/application-assets/service.ts",
        needle: "scorecardOutcomeTexts(context.requirement.scorecard)",
      },
      {
        path: "src/lib/application-summary/service.ts",
        needle: "requirement.scorecardJson",
      },
      {
        path: "src/app/(app)/campaigns/[id]/summary/page.tsx",
        needle: "view.requirement.scorecardJson",
      },
    ];
    for (const reader of readers) {
      expect(readFileSync(reader.path, "utf8")).toContain(reader.needle);
    }
  });

  it("keeps Harper assessment wiring unchanged", () => {
    const consultation = readFileSync(
      "src/components/ConsultationSection.tsx",
      "utf8",
    );
    expect(consultation).toContain("assessments");
    expect(consultation).toContain("session?.assessments");
    const assess = readFileSync("src/lib/consultation/assess.ts", "utf8");
    expect(assess).toContain("input.scorecard.outcomes");
    expect(assess).toContain("input.scorecard.competencies");
    expect(assess).toContain("input.scorecard.mission");
  });
});

describe.skipIf(!hasTestDatabase())("job requirement learned notes and posting save", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let campaignId = "";
  let userId = "";
  let companyId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    prisma = new PrismaClient();
    const workspace = await createIndividualWorkspace({
      email: `job-req-page-${suffix}@example.test`,
      name: "Job Req Seeker",
    });
    organizationId = workspace.organization.id;
    userId = workspace.user.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Profile ${suffix}`,
        approvalStatus: "APPROVED",
      },
    });
    const icp = await prisma.icp.create({
      data: { organizationId, productId: product.id, name: `ICP ${suffix}` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Job req ${suffix}`,
        productId: product.id,
        icpId: icp.id,
      },
    });
    campaignId = campaign.id;
    const company = await prisma.company.create({
      data: {
        organizationId,
        name: `Northline ${suffix}`,
        normalizedName: `northline-${suffix}`,
      },
    });
    companyId = company.id;
    const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId,
        companyId,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        companyName: parsed.companyName,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        responsibilities: parsed.responsibilities,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
        identityConfirmation: "CONFIRMED",
      },
    });
    await prisma.companyResearch.create({
      data: {
        organizationId,
        companyId,
        companySummary: "Warehouse robotics software.",
        whatTheySell: "Warehouse robots",
          status: "COMPLETED",
          researchMethod: "AUTOMATED",
          researchedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization
        .delete({ where: { id: organizationId } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("saves learned notes and uses them when the posting is saved", async () => {
    const {
      saveApplicationJobLearnedNotes,
      saveApplicationJobPosting,
    } = await import("@/lib/application/service");
    const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
    interpretJobPosting.mockImplementation(
      async (_rawText: string, _usage?: unknown, notes?: string | null) => {
        expect(notes).toBeUndefined();
        return {
          data: {
            ...parsed,
            title: "Replaced title",
            requiredItems: [...parsed.requiredItems, "Security sales experience"],
          },
          skipped: false,
        };
      },
    );
    await saveApplicationJobLearnedNotes({
      organizationId,
      campaignId,
      userId,
      notes: "The interviewer said the team wants security sales more than general sales.",
    });
    const stored = await prisma.jobRequirement.findUniqueOrThrow({
      where: { campaignId },
    });
    expect(stored.seekerLearnedNotes).toContain("security sales");
    expect(interpretJobPosting).not.toHaveBeenCalled();

    await saveApplicationJobPosting({
      organizationId,
      campaignId,
      userId,
      rawText: `${NORMAL_JOB_POSTING}\nReplaced title`,
    });
    const afterPosting = await prisma.jobRequirement.findUniqueOrThrow({
      where: { campaignId },
    });
    expect(afterPosting.rawText).toContain("Replaced title");
    expect(afterPosting.title).toBe("Replaced title");
    expect(afterPosting.requiredItems).toEqual(
      expect.arrayContaining(["Security sales experience"]),
    );
    expect(afterPosting.scorecardJson).toEqual(parsed.scorecard);
    expect(interpretJobPosting).toHaveBeenCalledTimes(1);
  });
});

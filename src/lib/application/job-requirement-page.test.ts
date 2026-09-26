import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NORMAL_JOB_MODEL, NORMAL_JOB_POSTING } from "@/lib/job-requirement/fixtures";
import { normalizeParsedJobRequirement } from "@/lib/job-requirement/normalize";
import { buildJobRequirementMessages } from "@/lib/job-requirement/prompt";
import {
  applicationWorkspaceCopy,
  polishCopy,
} from "@/lib/product-config";
import { hasTestDatabase } from "@/test/database";

const interpretJobPosting = vi.hoisted(() => vi.fn());

vi.mock("@/lib/job-requirement/parse", () => ({
  interpretJobPosting,
}));

describe("job requirements page", () => {
  const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
  const actions = readFileSync(
    "src/components/ApplicationJobRequirementActions.tsx",
    "utf8",
  );

  it("renders the job requirements once and has no field-by-field edit form", () => {
    expect(workspace).toContain("job-requirement-view");
    expect(workspace).toContain("ApplicationJobRequirementActions");
    expect(workspace).not.toContain("ApplicationJobRequirementForm");
    expect(workspace.split("job-requirement-view").length).toBe(2);
    expect(actions).not.toContain('name="title"');
    expect(actions).not.toContain('name="responsibilities"');
    expect(actions).not.toContain('name="outcomes"');
  });

  it("edits the original posting, regenerates, and keeps learned notes collapsed", () => {
    expect(actions).toContain("edit-job-posting");
    expect(actions).toContain("saveApplicationJobPostingAction");
    expect(actions).toContain("regenerate-job-requirement");
    expect(actions).toContain("regenerateApplicationJobRequirementAction");
    expect(actions).toContain("polishCopy.regenerate");
    expect(actions).toContain("job-learned-notes");
    expect(actions).toContain("<details");
    expect(actions).toContain("saveApplicationJobLearnedNotesAction");
    expect(polishCopy.regenerate).toBe("Regenerate");
  });

  it("does not show Inferred tags and includes the scorecard note", () => {
    expect(workspace).not.toContain("criterionFlags.inference");
    expect(workspace).not.toContain("polishCopy.inferredLabel");
    expect(workspace).toContain("scorecard-note");
    expect(workspace).toContain("applicationWorkspaceCopy.scorecardNote");
    expect(applicationWorkspaceCopy.scorecardNote).toContain("{consultant}");
    expect(applicationWorkspaceCopy.scorecardNote).toContain("{product}");
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

  it("includes learned notes when regenerating the posting interpretation", () => {
    const messages = buildJobRequirementMessages(
      "Senior sales role",
      "The interviewer said the role is more security sales than general sales.",
    );
    const user = JSON.parse(messages[1]!.content);
    expect(user.seekerLearnedNotes).toContain("security sales");
    expect(user.instruction).toMatch(/notes/i);
  });
});

describe.skipIf(!hasTestDatabase())("job requirement learned notes and regenerate", () => {
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

  it("saves learned notes and uses them when the posting is saved and regenerated", async () => {
    const {
      saveApplicationJobLearnedNotes,
      saveApplicationJobPosting,
      regenerateApplicationJobRequirement,
    } = await import("@/lib/application/service");
    await saveApplicationJobLearnedNotes({
      organizationId,
      campaignId,
      notes: "The interviewer said the team wants security sales more than general sales.",
    });
    const stored = await prisma.jobRequirement.findUniqueOrThrow({
      where: { campaignId },
    });
    expect(stored.seekerLearnedNotes).toContain("security sales");

    const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
    let parseCount = 0;
    interpretJobPosting.mockImplementation(
      async (_rawText: string, _usage?: unknown, notes?: string | null) => {
        expect(notes).toContain("security sales");
        parseCount += 1;
        return {
          ...parsed,
          title: parseCount === 1 ? "Replaced title" : "Regenerated title",
          requiredItems: [...parsed.requiredItems, "Security sales experience"],
        };
      },
    );

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

    await regenerateApplicationJobRequirement({
      organizationId,
      campaignId,
      userId,
    });
    const afterRegen = await prisma.jobRequirement.findUniqueOrThrow({
      where: { campaignId },
    });
    expect(afterRegen.title).toBe("Regenerated title");
    expect(interpretJobPosting).toHaveBeenCalledTimes(2);
    const fit = await prisma.applicationFit.findUnique({
      where: { campaignId },
    });
    expect(fit).toBeTruthy();
    expect(fit?.stale).toBe(false);
  });
});

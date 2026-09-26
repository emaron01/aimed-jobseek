import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applicationAssetConfig } from "@/lib/product-config";
import { consultationConversationCopy } from "@/lib/product-config/consultation";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";
import {
  parseCandidateProfile,
} from "@/lib/product-research/candidate-profile";
import {
  saveSeekerStatedBackground,
  seekerBackgroundText,
  SEEKER_STATED_FACT_ID,
} from "@/lib/product-research/seeker-background";
import { hasTestDatabase } from "@/test/database";

describe("What You Should Know About Me", () => {
  it("adds the button on the Harper page", () => {
    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    const widget = readFileSync(
      "src/components/ConsultationKnowAboutMe.tsx",
      "utf8",
    );
    expect(section).toContain("ConsultationKnowAboutMe");
    expect(widget).toContain("consultationConversationCopy.knowAboutMe");
    expect(widget).toContain("saveWhatYouShouldKnowAboutMeAction");
    expect(consultationConversationCopy.knowAboutMe).toBe(
      "What You Should Know About Me",
    );
  });

  it("feeds learned notes to Harper and the Interview cheat sheet", () => {
    const consultation = readFileSync(
      "src/lib/consultation/service.ts",
      "utf8",
    );
    const prompt = readFileSync("src/lib/consultation/prompt.ts", "utf8");
    const summary = readFileSync(
      "src/lib/application-summary/service.ts",
      "utf8",
    );
    expect(consultation).toContain("learnedNotesEvidence");
    expect(consultation).toContain("seekerLearnedNotes");
    expect(prompt).toContain("seekerLearnedNotes");
    expect(summary).toContain("job:learned-notes");
  });

  it("shows new information on resume and cover letter with regenerate", () => {
    const assets = readFileSync(
      "src/components/ApplicationAssetsSection.tsx",
      "utf8",
    );
    expect(assets).toContain("staleReason");
    expect(assets).toContain("-new-information");
    expect(assets).toContain("applicationAssetConfig.labels.regenerate");
    expect(applicationAssetConfig.labels.newInformationAvailable).toBe(
      "New information is available.",
    );
  });
});

describe.skipIf(!hasTestDatabase())("seeker-stated background persistence", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let campaignId = "";
  let productId = "";
  let userId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    prisma = new PrismaClient();
    const workspace = await createIndividualWorkspace({
      email: `know-about-me-${suffix}@example.test`,
      name: "Background Seeker",
    });
    organizationId = workspace.organization.id;
    userId = workspace.user.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Profile ${suffix}`,
        approvalStatus: "APPROVED",
        profileJson: fixtureAlexChenProfile(),
      },
    });
    productId = product.id;
    const icp = await prisma.icp.create({
      data: { organizationId, productId, name: `ICP ${suffix}` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Know about me ${suffix}`,
        productId,
        icpId: icp.id,
      },
    });
    campaignId = campaign.id;
    await prisma.applicationAsset.create({
      data: {
        organizationId,
        campaignId,
        type: "RESUME",
        groupKey: "RESUME",
        version: 1,
        contentJson: { type: "RESUME", summary: "Draft resume" },
        claimTraceJson: [],
        promptVersion: "1",
      },
    });
    await prisma.applicationAsset.create({
      data: {
        organizationId,
        campaignId,
        type: "COVER_LETTER",
        groupKey: "COVER_LETTER",
        version: 1,
        contentJson: { type: "COVER_LETTER", body: "Draft letter" },
        claimTraceJson: [],
        promptVersion: "1",
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

  it("saves a seeker-stated fact on the Personal Profile and marks resume and cover letter", async () => {
    const text =
      "I have 9 years of security sales; the resume I gave was focused on a non-security job.";
    const next = await saveSeekerStatedBackground({
      organizationId,
      productId,
      userId,
      campaignId,
      text,
    });
    expect(next.seekerStatedFacts).toHaveLength(1);
    expect(next.seekerStatedFacts[0]?.id).toBe(SEEKER_STATED_FACT_ID);
    expect(next.seekerStatedFacts[0]?.kind).toBe("FACT");
    expect(next.seekerStatedFacts[0]?.text).toBe(text);
    expect(next.seekerStatedFacts[0]?.provenance.length).toBeGreaterThan(0);
    expect(seekerBackgroundText(next)).toBe(text);

    const stored = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const profile = parseCandidateProfile(stored.profileJson);
    expect(profile.seekerStatedFacts[0]?.text).toBe(text);
    expect(profile.seekerStatedFacts[0]?.kind).toBe("FACT");

    const assets = await prisma.applicationAsset.findMany({
      where: { campaignId },
    });
    expect(assets).toHaveLength(2);
    expect(
      assets.every(
        (asset) =>
          asset.staleReason ===
          applicationAssetConfig.labels.newInformationAvailable,
      ),
    ).toBe(true);
  });
});

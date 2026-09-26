import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";
import { hasTestDatabase } from "@/test/database";

vi.mock("@/lib/contact-profile/extract", () => ({
  extractInterviewerFacts: vi.fn(async () => ({
    ok: true,
    data: {
      headline: { text: "Head of Talent at CSC", kind: "FACT", provenance: [{ sourceId: "linkedin-paste" }] },
      about: null,
      currentTitle: { text: "Head of Talent", kind: "FACT", provenance: [{ sourceId: "linkedin-paste" }] },
      currentEmployer: { text: "CSC", kind: "FACT", provenance: [{ sourceId: "linkedin-paste" }] },
      currentTenure: { text: "since 2019", kind: "FACT", provenance: [{ sourceId: "linkedin-paste" }] },
      workExperience: [
        {
          employer: { text: "CSC", kind: "FACT", provenance: [{ sourceId: "linkedin-paste" }] },
          title: { text: "Head of Talent", kind: "FACT", provenance: [{ sourceId: "linkedin-paste" }] },
          dates: { text: "2019 - Present", kind: "FACT", provenance: [{ sourceId: "linkedin-paste" }] },
          location: null,
          description: {
            text: "Owns interviewer training.",
            kind: "FACT",
            provenance: [{ sourceId: "linkedin-paste" }],
          },
          accomplishments: [],
        },
      ],
      priorRoles: [],
      education: [],
      certifications: [],
      skills: [],
      statedFocus: [],
    },
  })),
}));

vi.mock("@/lib/contact-profile/ai", () => ({
  generateIndividualProfileWithModel: vi.fn(async () => ({
    ok: true,
    data: {
      caresAbout: [{ text: "Hiring process", kind: "INFERENCE" }],
      talkingPoints: [{ text: "Ask about campus", kind: "INFERENCE" }],
      likelyToValue: [
        {
          text: "Christina is big on interviewer training: she owns it at CSC after leading campus recruiting at Northwind.",
          kind: "INFERENCE",
        },
      ],
    },
  })),
}));

describe.skipIf(!hasTestDatabase())("rebuild existing interviewer profiles", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let userId = "";
  let campaignId = "";
  let contactId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    prisma = new PrismaClient();
    const workspace = await createIndividualWorkspace({
      email: `rebuild-profile-${suffix}@example.test`,
      name: "Rebuild Seeker",
    });
    organizationId = workspace.organization.id;
    userId = workspace.user.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Profile ${suffix}`,
        approvalStatus: "APPROVED",
        profileJson: fixtureAlexChenProfile() as object,
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Rebuild ${suffix}`,
        productId: product.id,
      },
    });
    campaignId = campaign.id;
    const contact = await prisma.contact.create({
      data: {
        organizationId,
        ownerUserId: userId,
        firstName: "Christina",
        lastName: "Schivley",
        title: "Head of Talent",
      },
    });
    contactId = contact.id;
    await prisma.campaignContact.create({
      data: {
        organizationId,
        campaignId,
        contactId,
        linkedInProfileText:
          "Christina Schivley, Head of Talent at CSC since 2019. Previously led campus recruiting at Northwind.",
        linkedInExtractedJson: {
          currentTitle: null,
          currentEmployer: null,
          currentTenure: null,
          priorRoles: [],
          education: [],
          statedFocus: [],
        },
        individualProfileJson: {
          caresAbout: [{ text: "Hiring process", kind: "INFERENCE" }],
          talkingPoints: [{ text: "Ask about campus", kind: "INFERENCE" }],
          commonGround: [],
          promptVersion: "1",
        },
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

  it("queues a rebuild for people who already have pasted text, without re-pasting", async () => {
    const { queueExistingInterviewerProfileRebuilds } = await import(
      "@/lib/contact-profile/service"
    );
    const queued = await queueExistingInterviewerProfileRebuilds();
    expect(queued).toBeGreaterThanOrEqual(1);
    const jobs = await prisma.applicationJob.findMany({
      where: {
        organizationId,
        campaignId,
        type: "CONTACT_PROFILE",
        targetId: contactId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    });
    expect(jobs).toHaveLength(1);
    const membership = await prisma.campaignContact.findFirst({
      where: { campaignId, contactId },
    });
    expect(membership?.linkedInProfileText).toContain("Christina Schivley");
  });

  it("re-extracts stored text and writes likelyToValue without re-pasting", async () => {
    const { buildContactIndividualProfile } = await import(
      "@/lib/contact-profile/service"
    );
    const { individualProfileRecordSchema } = await import(
      "@/lib/contact-profile/contract"
    );
    await buildContactIndividualProfile({
      organizationId,
      campaignId,
      contactId,
    });
    const stored = await prisma.campaignContact.findFirst({
      where: { campaignId, contactId },
    });
    const parsed = individualProfileRecordSchema.parse(
      stored?.individualProfileJson,
    );
    expect(stored?.linkedInExtractedJson).toMatchObject({
      currentEmployer: { text: "CSC" },
    });
    expect(parsed.likelyToValue[0]?.text).toContain("interviewer training");
    expect(stored?.linkedInProfileText).toContain("Christina Schivley");
  });
});

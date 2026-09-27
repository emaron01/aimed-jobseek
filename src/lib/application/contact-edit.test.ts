import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hasTestDatabase } from "@/test/database";
import {
  addApplicationContact,
  assignApplicationContactToPersona,
  listApplicationContacts,
  updateApplicationContact,
} from "@/lib/application/contacts";

vi.mock("@/lib/contact-profile/extract", () => ({
  extractInterviewerFacts: vi.fn(async () => ({
    ok: true,
    data: {
      headline: { text: "Head of Talent at CSC", kind: "FACT", provenance: [] },
      about: null,
      currentTitle: { text: "Head of Talent", kind: "FACT", provenance: [] },
      currentEmployer: { text: "CSC", kind: "FACT", provenance: [] },
      currentTenure: null,
      workExperience: [],
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
      likelyToValue: [{ text: "Likely to value interviewer training.", kind: "INFERENCE" }],
    },
  })),
}));

describe.skipIf(!hasTestDatabase())("edit an existing application contact", () => {
  const suffix = Date.now().toString(36);
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let userId = "";
  let campaignId = "";
  let otherCampaignId = "";
  let personaId = "";
  let recruiterPersonaId = "";
  let contactId = "";
  let membershipId = "";
  let assetId = "";
  let stageId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    const organization = await prisma.organization.create({
      data: { name: `[TEST] Contact edit ${suffix}`, slug: `contact-edit-${suffix}` },
    });
    organizationId = organization.id;
    const user = await prisma.user.create({
      data: {
        email: `contact-edit-${suffix}@example.test`,
        emailNormalized: `contact-edit-${suffix}@example.test`,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: { organizationId, name: `Candidate ${suffix}` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        productId: product.id,
        name: `CSC ${suffix}`,
      },
    });
    campaignId = campaign.id;
    const other = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        productId: product.id,
        name: `Other ${suffix}`,
      },
    });
    otherCampaignId = other.id;
    const persona = await prisma.persona.create({
      data: {
        organizationId,
        productId: product.id,
        campaignId,
        name: "Hiring Manager",
        suggestionKey: "hiring_manager",
        targetTitles: ["VP Sales"],
      },
    });
    personaId = persona.id;
    const recruiter = await prisma.persona.create({
      data: {
        organizationId,
        productId: product.id,
        campaignId,
        name: "Talent Acquisition Partner",
        suggestionKey: "recruiter",
        targetTitles: ["Recruiter"],
      },
    });
    recruiterPersonaId = recruiter.id;
    const added = await addApplicationContact({
      organizationId,
      campaignId,
      userId,
      firstName: "Christina",
      lastName: "Schivley",
      title: "Head of Talent",
      email: `christina-${suffix}@csc.example`,
      linkedinUrl: "https://www.linkedin.com/in/christina-schivley",
      personaId,
      confirmRole: true,
    });
    contactId = added.contactId;
    membershipId = added.campaignContactId;
    const asset = await prisma.applicationAsset.create({
      data: {
        organizationId,
        campaignId,
        type: "EMAIL",
        contactId,
        personaId,
        groupKey: `EMAIL:${personaId}:${contactId}:PROACTIVE`,
        version: 1,
        status: "APPROVED",
        contentJson: { subject: "Hello", body: "Hello Christina" },
        claimTraceJson: [],
        promptVersion: "test",
      },
    });
    assetId = asset.id;
    const stage = await prisma.interviewStage.create({
      data: {
        organizationId,
        campaignId,
        type: "RECRUITER_SCREEN",
        format: "PHONE",
        scheduledAt: new Date(),
        sortOrder: 0,
        interviewers: { create: { organizationId, contactId } },
      },
    });
    stageId = stage.id;
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("updates the contact everywhere and keeps messages and stages", async () => {
    await updateApplicationContact({
      organizationId,
      userId,
      contactId,
      campaignId,
      firstName: "Christina",
      lastName: "Schivley-Edited",
      title: "VP Talent",
      email: `christina-${suffix}@csc.example`,
      linkedinUrl: "https://www.linkedin.com/in/christina-schivley",
      personaId: recruiterPersonaId,
    });
    const contact = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
    expect(contact.lastName).toBe("Schivley-Edited");
    expect(contact.title).toBe("VP Talent");
    expect(contact.previousTitle).toBe("Head of Talent");
    const membership = await prisma.campaignContact.findUniqueOrThrow({
      where: { id: membershipId },
    });
    expect(membership.contactId).toBe(contactId);
    expect(membership.chosenPersonaId).toBe(recruiterPersonaId);
    const asset = await prisma.applicationAsset.findUniqueOrThrow({ where: { id: assetId } });
    expect(asset.contactId).toBe(contactId);
    expect(asset.contentJson).toMatchObject({ subject: "Hello" });
    const stage = await prisma.interviewStage.findUniqueOrThrow({
      where: { id: stageId },
      include: { interviewers: true },
    });
    expect(stage.interviewers.map((row) => row.contactId)).toEqual([contactId]);
    const otherContacts = await prisma.campaignContact.count({
      where: { campaignId: otherCampaignId },
    });
    expect(otherContacts).toBe(0);
    const listed = await listApplicationContacts({ organizationId, campaignId });
    expect(listed.map((row) => row.contactId)).toEqual([contactId]);
    const otherListed = await listApplicationContacts({
      organizationId,
      campaignId: otherCampaignId,
    });
    expect(otherListed).toEqual([]);
  });

  it("moves a contact from one persona to another without building either persona", async () => {
    const before = await prisma.campaignContact.findUniqueOrThrow({
      where: { id: membershipId },
    });
    const target =
      before.chosenPersonaId === personaId ? recruiterPersonaId : personaId;
    const moved = await assignApplicationContactToPersona({
      organizationId,
      campaignId,
      userId,
      contactId,
      personaId: target,
    });
    expect(moved.moved).toBe(true);
    expect(moved.personaId).toBe(target);
    const after = await prisma.campaignContact.findUniqueOrThrow({
      where: { id: membershipId },
    });
    expect(after.chosenPersonaId).toBe(target);
    expect(
      await prisma.applicationJob.count({
        where: { campaignId, type: "HIRING_TEAM_BUILD" },
      }),
    ).toBe(0);
  });

  it("runs extraction, the individual profile, and cheat sheet regen when paste changes", async () => {
    const bio = "Christina Schivley leads Talent at CSC. She previously ran campus recruiting.";
    const teamPage =
      "The Talent team is led by Christina Schivley, who owns interviewer training.";
    for (const pastedText of [
      "Christina Schivley\nHead of Talent at CSC\nExperience\nCSC — Head of Talent",
      bio,
      teamPage,
    ]) {
      const result = await updateApplicationContact({
        organizationId,
        userId,
        contactId,
        campaignId,
        firstName: "Christina",
        lastName: "Schivley-Edited",
        title: "VP Talent",
        personaId: recruiterPersonaId,
        pastedText,
      });
      expect(result.contactId).toBe(contactId);
      expect(result.pasteQueued).toBe(true);
    }
    const membership = await prisma.campaignContact.findUniqueOrThrow({
      where: { id: membershipId },
    });
    expect(membership.linkedInProfileText).toContain("interviewer training");
    expect(membership.contactId).toBe(contactId);
    const profileJobs = await prisma.applicationJob.findMany({
      where: { campaignId, type: "CONTACT_PROFILE", targetId: contactId },
    });
    expect(profileJobs.length).toBeGreaterThan(0);
    const { buildContactIndividualProfile } = await import(
      "@/lib/contact-profile/service"
    );
    await buildContactIndividualProfile({ organizationId, campaignId, contactId });
    const afterBuild = await prisma.campaignContact.findUniqueOrThrow({
      where: { id: membershipId },
    });
    expect(afterBuild.linkedInExtractedJson).toMatchObject({
      currentTitle: { text: "Head of Talent" },
    });
    expect(afterBuild.individualProfileJson).toMatchObject({
      likelyToValue: [{ text: "Likely to value interviewer training." }],
    });
    const cheatSheetJobs = await prisma.applicationJob.findMany({
      where: { campaignId, type: "APPLICATION_SUMMARY", targetId: `contact:${contactId}` },
    });
    expect(cheatSheetJobs.length).toBeGreaterThan(0);
    const asset = await prisma.applicationAsset.findUniqueOrThrow({ where: { id: assetId } });
    expect(asset.id).toBe(assetId);
    const stage = await prisma.interviewStage.findUniqueOrThrow({
      where: { id: stageId },
      include: { interviewers: true },
    });
    expect(stage.interviewers[0]?.contactId).toBe(contactId);
  });
});

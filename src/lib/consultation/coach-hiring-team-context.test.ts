import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildConsultationCoachMessages } from "@/lib/consultation/prompt";
import type { CoachHiringTeamRole } from "@/lib/consultation/contract";
import { linkedInExtractedSchema } from "@/lib/contact-profile/contract";
import { extractLinkedInFacts } from "@/lib/contact-profile/extract";
import { CONSULTATION_COACH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";
import { hasTestDatabase } from "@/test/database";

function roleWithPerson(): CoachHiringTeamRole {
  return {
    id: "role_1",
    name: "VP Revenue Operations",
    likelyTitles: ["VP RevOps"],
    whyThisRoleMatters: "Owns the forecast this hire fixes.",
    personaBuilt: true,
    persona: {
      definition: "Runs revenue operations for a scaling sales org.",
      department: "Revenue",
      seniority: "VP",
      responsibilities: "Forecast accuracy and pipeline hygiene.",
      painPoints: "Forecast slips every quarter.",
      desiredOutcomes: "A forecast the board trusts.",
      messagingNotes: "Lead with measurable forecast accuracy.",
      additionalContext: null,
      overview: "Runs revenue operations for a scaling sales org.",
      impact: "Owns the number the board sees.",
      pressures: ["Board scrutiny on forecast accuracy"],
      needs: ["Clean pipeline data"],
      concerns: ["Another tool nobody adopts"],
      evaluates: ["Evidence of forecast ownership"],
      talkingPoints: ["Forecast accuracy gains"],
      communication: ["Direct, numbers first"],
      interviewStage: "Second-round panel",
    },
    people: [
      {
        contactId: "contact_1",
        name: "Dana Reyes",
        title: "VP Revenue Operations",
        employer: "Northline",
        linkedInUrl: "https://www.linkedin.com/in/dana-reyes",
        roleConfirmed: true,
        persona: {
          caresAbout: ["Territory design that survives a reorg"],
          talkingPoints: ["Ask about their Clari rollout"],
          commonGround: [
            {
              text: "Both ran a CRM migration",
              seekerSource: "profile:role_2",
              contactSource: "linkedin:contact_1",
            },
          ],
        },
        linkedIn: {
          headline: "VP Revenue Operations at Northline",
          about: "I rebuild forecasts that leadership can trust.",
          currentTitle: "VP Revenue Operations",
          currentEmployer: "Northline",
          currentTenure: "3 years",
          priorRoles: [
            {
              employer: "Helios",
              title: "Director RevOps",
              dates: "Jan 2019 - Mar 2023",
            },
          ],
          education: ["Purdue"],
          certifications: ["Salesforce Administrator"],
          skills: ["Forecasting", "Territory design"],
          statedFocus: ["Forecast discipline"],
          profileText: "Dana Reyes — VP Revenue Operations at Northline.",
        },
        recordedNotes: [
          {
            id: "note_1",
            text: "Invitation: wants to hear about enterprise motion.",
            stageId: "stage_1",
            recordedAt: "2026-09-20T00:00:00.000Z",
          },
        ],
        interviewStages: [
          {
            id: "stage_1",
            type: "HIRING_MANAGER",
            format: "VIDEO",
            scheduledAt: "2026-09-25T15:00:00.000Z",
            expectedDecisionAt: null,
            outcome: null,
            notesBefore: "They asked for a forecast walkthrough.",
            notesAfter: "They pushed hard on data hygiene.",
          },
        ],
        prepOpening: "Open with the Helios forecast rebuild.",
        interviewLearnings: ["They are replacing a failed Clari rollout."],
      },
    ],
  };
}

describe("Coach Hiring Team context", () => {
  it("sends the general persona and each person as separate entries", () => {
    const messages = buildConsultationCoachMessages({
      targets: [{ key: "forecasting", kind: "REQUIRED", text: "Forecasting" }],
      profileItems: [
        {
          id: "fact_1",
          kind: "FACT",
          text: "Rebuilt the forecast at Helios.",
          itemType: "ACHIEVEMENT",
        },
      ],
      hiringTeam: [roleWithPerson()],
      seekerStatedFacts: [],
      askedQuestions: [],
      chronologyRequested: false,
      coveredTargetKeys: [],
    });
    const profileMessage = JSON.parse(messages[1]!.content);
    expect(profileMessage.personalProfileItems).toHaveLength(1);
    expect(profileMessage.hiringTeam).toBeUndefined();

    const payload = JSON.parse(messages[2]!.content);
    const role = payload.hiringTeam[0];
    expect(role.personaBuilt).toBe(true);
    expect(role.generalPersona.impact).toBe("Owns the number the board sees.");
    expect(role.generalPersona.evaluates).toEqual([
      "Evidence of forecast ownership",
    ]);
    expect(role.people).toHaveLength(1);

    const person = role.people[0];
    expect(person.contactId).toBe("contact_1");
    expect(person.persona.caresAbout[0]).toContain("Territory design");
    expect(person.linkedIn.headline).toContain("Northline");
    expect(person.linkedIn.about).toContain("forecasts");
    expect(person.linkedIn.priorRoles[0]).toEqual({
      employer: "Helios",
      title: "Director RevOps",
      dates: "Jan 2019 - Mar 2023",
    });
    expect(person.linkedIn.certifications).toEqual(["Salesforce Administrator"]);
    expect(person.linkedIn.skills).toContain("Territory design");
    expect(person.linkedIn.profileText).toContain("Dana Reyes");
    expect(person.recordedNotes[0].text).toContain("Invitation:");
    expect(person.interviewStages[0].notesAfter).toContain("data hygiene");
    expect(person.interviewLearnings[0]).toContain("failed Clari rollout");
    expect(person.prepOpening).toContain("Helios");

    expect(JSON.stringify(role.generalPersona)).not.toContain("Dana Reyes");
    expect(JSON.stringify(role.generalPersona)).not.toContain("Clari");
  });

  it("sends a role with no built persona and no people without inventing detail", () => {
    const payload = JSON.parse(
      buildConsultationCoachMessages({
        targets: [],
        profileItems: [],
        hiringTeam: [
          {
            id: "role_2",
            name: "Recruiter",
            likelyTitles: ["Technical Recruiter"],
            whyThisRoleMatters: "Runs the screen.",
            personaBuilt: false,
            persona: null,
            people: [],
          },
        ],
        seekerStatedFacts: [],
        askedQuestions: [],
        chronologyRequested: false,
        coveredTargetKeys: [],
      })[2]!.content,
    );
    expect(payload.hiringTeam[0].generalPersona).toBeNull();
    expect(payload.hiringTeam[0].people).toEqual([]);
    expect(payload.hiringTeam[0].whyThisRoleMatters).toBe("Runs the screen.");
  });

  it("extracts the headline, About, dated prior roles, certifications, and skills", () => {
    const extracted = extractLinkedInFacts(`Dana Reyes
VP Revenue Operations at Northline
Indianapolis, Indiana
About
I rebuild forecasts leadership can trust.
Experience
VP Revenue Operations
Northline · Full-time
Apr 2023 - Present
Director of Revenue Operations
Helios
Jan 2019 - Mar 2023
Education
Purdue University
Licenses & certifications
Salesforce Administrator
Skills
Forecasting
Territory design
`);
    expect(extracted.headline?.text).toBe("VP Revenue Operations at Northline");
    expect(extracted.about?.text).toBe("I rebuild forecasts leadership can trust.");
    expect(extracted.certifications.map((item) => item.text)).toEqual([
      "Salesforce Administrator",
    ]);
    expect(extracted.skills.map((item) => item.text)).toEqual([
      "Forecasting",
      "Territory design",
    ]);
    expect(extracted.education.map((item) => item.text)).toEqual([
      "Purdue University",
    ]);
    const prior = extracted.priorRoles.find(
      (role) => role.title?.text === "Director of Revenue Operations",
    );
    expect(prior?.employer.text).toBe("Helios");
    expect(prior?.dates?.text).toBe("Jan 2019 - Mar 2023");
  });

  it("keeps already-stored extracts readable after the new fields were added", () => {
    const stored = linkedInExtractedSchema.parse({
      currentTitle: null,
      currentEmployer: null,
      currentTenure: null,
      priorRoles: [
        {
          employer: {
            text: "Helios",
            kind: "FACT",
            provenance: [{ sourceId: "linkedin-paste" }],
          },
          title: null,
        },
      ],
      education: [],
      statedFocus: [],
    });
    expect(stored.headline).toBeNull();
    expect(stored.about).toBeNull();
    expect(stored.certifications).toEqual([]);
    expect(stored.skills).toEqual([]);
    expect(stored.priorRoles[0]?.dates).toBeNull();
  });

  it("tells Harper to keep a person and the general persona separate", () => {
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain("generalPersona");
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain(
      "Never merge a person into the generalPersona",
    );
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain(
      "never apply one person's details to another",
    );
  });
});

describe.skipIf(!hasTestDatabase())("Coach Hiring Team context from the database", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let userId = "";
  let campaignId = "";
  let builtRoleId = "";
  let unbuiltRoleId = "";
  let contactId = "";
  let noLinkedInContactId = "";
  let stageId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    prisma = new PrismaClient();
    const workspace = await createIndividualWorkspace({
      email: `coach-hiring-team-${suffix}@example.test`,
      name: "Coach Context Seeker",
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
        name: `Coach context ${suffix}`,
        productId: product.id,
      },
    });
    campaignId = campaign.id;
    const builtRole = await prisma.persona.create({
      data: {
        organizationId,
        productId: product.id,
        campaignId,
        name: "VP Revenue Operations",
        targetTitles: ["VP RevOps"],
        whyThisPersonaMatters: "Owns the forecast this hire fixes.",
        definition: "Runs revenue operations for a scaling sales org.",
        department: "Revenue",
        seniority: "VP",
        responsibilities: "Forecast accuracy and pipeline hygiene.",
        painPoints: "Forecast slips every quarter.",
        desiredOutcomes: "A forecast the board trusts.",
        messagingNotes: "Lead with measurable forecast accuracy.",
        setupStatus: "NEEDS_REVIEW",
        profileJson: {
          involvement: "DIRECT",
          narrative: {
            overview: { text: "Runs revenue operations.", kind: "INFERENCE" },
            impact: { text: "Owns the number the board sees.", kind: "INFERENCE" },
            pressures: [{ text: "Board scrutiny", kind: "INFERENCE" }],
            needs: [{ text: "Clean pipeline data", kind: "INFERENCE" }],
            concerns: [{ text: "Another unused tool", kind: "INFERENCE" }],
            evaluates: [{ text: "Forecast ownership", kind: "INFERENCE" }],
            talkingPoints: [{ text: "Forecast accuracy gains", kind: "INFERENCE" }],
            communication: [{ text: "Numbers first", kind: "INFERENCE" }],
            interviewStage: { text: "Second-round panel", kind: "INFERENCE" },
          },
        },
      },
    });
    builtRoleId = builtRole.id;
    const unbuiltRole = await prisma.persona.create({
      data: {
        organizationId,
        productId: product.id,
        campaignId,
        name: "Recruiter",
        targetTitles: ["Technical Recruiter"],
        whyThisPersonaMatters: "Runs the screen.",
        setupStatus: "NOT_STARTED",
      },
    });
    unbuiltRoleId = unbuiltRole.id;
    const contact = await prisma.contact.create({
      data: {
        organizationId,
        ownerUserId: userId,
        firstName: "Dana",
        lastName: "Reyes",
        title: "VP Revenue Operations",
        company: "Northline",
        linkedinUrl: "https://www.linkedin.com/in/dana-reyes",
      },
    });
    contactId = contact.id;
    await prisma.campaignContact.create({
      data: {
        organizationId,
        campaignId,
        contactId,
        chosenPersonaId: builtRoleId,
        roleConfirmed: true,
        linkedInProfileText: "Dana Reyes — VP Revenue Operations at Northline.",
        linkedInExtractedJson: {
          currentTitle: {
            text: "VP Revenue Operations",
            kind: "FACT",
            provenance: [{ sourceId: "linkedin-paste" }],
          },
          currentEmployer: {
            text: "Northline",
            kind: "FACT",
            provenance: [{ sourceId: "linkedin-paste" }],
          },
          currentTenure: null,
          priorRoles: [
            {
              employer: {
                text: "Helios",
                kind: "FACT",
                provenance: [{ sourceId: "linkedin-paste" }],
              },
              title: null,
            },
          ],
          education: [],
          statedFocus: [],
        },
        individualProfileJson: {
          caresAbout: [
            { text: "Territory design that survives a reorg", kind: "INFERENCE" },
          ],
          talkingPoints: [{ text: "Ask about their Clari rollout", kind: "INFERENCE" }],
          commonGround: [
            {
              text: "Both ran a CRM migration",
              seekerSource: "profile:role_2",
              contactSource: "linkedin:dana",
            },
          ],
          promptVersion: "1",
        },
        cheatSheetNotesJson: [
          {
            id: "note_1",
            text: "Invitation: wants to hear about enterprise motion.",
            stageId: null,
            createdAt: "2026-09-20T00:00:00.000Z",
          },
        ],
        personPrepOpening: "Open with the Helios forecast rebuild.",
        personPrepAnswersJson: [
          { text: "They are replacing a failed Clari rollout.", turnId: "turn_1" },
        ],
      },
    });
    const withoutLinkedIn = await prisma.contact.create({
      data: {
        organizationId,
        ownerUserId: userId,
        firstName: "Sam",
        lastName: "Okafor",
        title: "Director of Sales",
      },
    });
    noLinkedInContactId = withoutLinkedIn.id;
    await prisma.campaignContact.create({
      data: {
        organizationId,
        campaignId,
        contactId: noLinkedInContactId,
        chosenPersonaId: builtRoleId,
        cheatSheetNotesJson: [
          {
            id: "note_2",
            text: "Invitation: 30 minutes on pipeline hygiene.",
            stageId: null,
            createdAt: "2026-09-21T00:00:00.000Z",
          },
        ],
        personPrepAnswersJson: [
          { text: "They own the SDR team.", turnId: "turn_2" },
        ],
      },
    });
    const stage = await prisma.interviewStage.create({
      data: {
        organizationId,
        campaignId,
        sortOrder: 1,
        type: "HIRING_MANAGER",
        format: "VIDEO",
        scheduledAt: new Date("2026-09-25T15:00:00.000Z"),
        notesBefore: "They asked for a forecast walkthrough.",
        notesAfter: "They pushed hard on data hygiene.",
      },
    });
    stageId = stage.id;
    await prisma.interviewStageInterviewer.create({
      data: { organizationId, stageId, contactId },
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

  it("returns the built general persona and the matched person's own evidence", async () => {
    const { loadCoachHiringTeam } = await import(
      "@/lib/consultation/hiring-team-context"
    );
    const roles = await loadCoachHiringTeam(organizationId, campaignId);
    const built = roles.find((role) => role.id === builtRoleId);
    const unbuilt = roles.find((role) => role.id === unbuiltRoleId);

    expect(built?.personaBuilt).toBe(true);
    expect(built?.persona?.impact).toBe("Owns the number the board sees.");
    expect(built?.persona?.painPoints).toBe("Forecast slips every quarter.");
    expect(built?.persona?.evaluates).toEqual(["Forecast ownership"]);

    expect(unbuilt?.personaBuilt).toBe(false);
    expect(unbuilt?.persona).toBeNull();
    expect(unbuilt?.people).toEqual([]);

    const person = built?.people.find((item) => item.contactId === contactId);
    expect(person?.contactId).toBe(contactId);
    expect(person?.name).toBe("Dana Reyes");
    expect(person?.title).toBe("VP Revenue Operations");
    expect(person?.linkedInUrl).toContain("dana-reyes");
    expect(person?.persona?.caresAbout).toEqual([
      "Territory design that survives a reorg",
    ]);
    expect(person?.persona?.commonGround[0]?.text).toBe("Both ran a CRM migration");
    expect(person?.linkedIn?.profileText).toContain("Dana Reyes");
    expect(person?.linkedIn?.currentEmployer).toBe("Northline");
    expect(person?.linkedIn?.priorRoles).toEqual([
      { employer: "Helios", title: null, dates: null },
    ]);
    expect(person?.linkedIn?.certifications).toEqual([]);
    expect(person?.linkedIn?.skills).toEqual([]);
    expect(person?.recordedNotes[0]?.text).toContain("Invitation:");
    expect(person?.interviewStages).toHaveLength(1);
    expect(person?.interviewStages[0]?.id).toBe(stageId);
    expect(person?.interviewStages[0]?.notesBefore).toContain("walkthrough");
    expect(person?.interviewStages[0]?.notesAfter).toContain("data hygiene");
    expect(person?.prepOpening).toContain("Helios");
    expect(person?.interviewLearnings).toEqual([
      "They are replacing a failed Clari rollout.",
    ]);
  });

  it("sends the other evidence with no LinkedIn fields when nothing was pasted", async () => {
    const { loadCoachHiringTeam } = await import(
      "@/lib/consultation/hiring-team-context"
    );
    const roles = await loadCoachHiringTeam(organizationId, campaignId);
    const person = roles
      .find((role) => role.id === builtRoleId)
      ?.people.find((item) => item.contactId === noLinkedInContactId);
    expect(person?.name).toBe("Sam Okafor");
    expect(person?.linkedIn).toBeNull();
    expect(person?.recordedNotes[0]?.text).toContain("pipeline hygiene");
    expect(person?.interviewLearnings).toEqual(["They own the SDR team."]);
  });

  it("keeps the person's evidence out of the general persona", async () => {
    const { loadCoachHiringTeam } = await import(
      "@/lib/consultation/hiring-team-context"
    );
    const roles = await loadCoachHiringTeam(organizationId, campaignId);
    const built = roles.find((role) => role.id === builtRoleId);
    const generalPersona = JSON.stringify(built?.persona);
    expect(generalPersona).not.toContain("Dana");
    expect(generalPersona).not.toContain("Clari");
    expect(generalPersona).not.toContain("Helios");
  });
});

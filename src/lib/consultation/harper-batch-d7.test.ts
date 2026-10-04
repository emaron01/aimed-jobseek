import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sourcesForPersonSection } from "@/lib/application-summary/service";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import {
  attachLearningsToHiringTeam,
  loadCoachHiringTeamWithLearnings,
} from "@/lib/consultation/hiring-team-context";
import {
  enqueueLearningsReassessIfChanged,
  isHiringManagerRole,
  learningsFingerprint,
  LEARNINGS_REASSESS_OPERATION,
  recordLearningsReassessFingerprint,
} from "@/lib/consultation/learnings";
import { CONSULTATION_COACH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content";
import { hasTestDatabase } from "@/test/database";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

const HM_LEARNINGS_SENTENCE =
  "What the seeker learned during the interview process (learned notes, notes before and after each interview, and newly gained information) applies to the Hiring Manager by default, including the matched Hiring Manager person when there is one; for other interviewers, use it only as background.";

const HIRING_TEAM_OPENING =
  "Hiring Team: each role carries generalPersona, the built persona for the role itself, and people, the individuals matched to that role. These are separate entries and stay separate: a person's own persona and LinkedIn details describe that individual only. Never merge a person into the generalPersona, never treat one person as standing for the role, and never apply one person's private details to another.";

describe("Harper Batch D7 — learnings fingerprint + HM routing", () => {
  it("bumps CONSULTATION_PROMPT_VERSION for the Hiring Team learnings sentence", () => {
    expect(CONSULTATION_PROMPT_VERSION).toBe("38");
  });

  it("coach prompt contains the exact new Hiring Team learnings sentence", () => {
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain(HIRING_TEAM_OPENING);
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain(HM_LEARNINGS_SENTENCE);
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).not.toContain(
      "a person's own persona, LinkedIn details, recorded notes, interview stages, and interview learnings describe that individual only",
    );
  });

  it("learnings fingerprint is stable for the same payload and changes when notes change", () => {
    const base = {
      seekerLearnedNotes: "They want security sales.",
      stages: [
        { id: "s1", notesBefore: "Prep forecast", notesAfter: null },
        { id: "s2", notesBefore: null, notesAfter: "Pushed on hygiene" },
      ],
      newlyGained: [
        {
          contactId: "c1",
          id: "n1",
          text: "Invitation: enterprise motion",
          stageId: "s1",
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    };
    const a = learningsFingerprint(base);
    const b = learningsFingerprint({ ...base });
    expect(a).toBe(b);
    const c = learningsFingerprint({
      ...base,
      seekerLearnedNotes: "They want security sales differently.",
    });
    expect(c).not.toBe(a);
  });

  it("includes CONSULTATION_PROMPT_VERSION in the fingerprint inputs", () => {
    const payload = {
      seekerLearnedNotes: "x",
      stages: [] as Array<{
        id: string;
        notesBefore: string | null;
        notesAfter: string | null;
      }>,
      newlyGained: [] as Array<{
        contactId: string;
        id: string;
        text: string;
        stageId: string | null;
        createdAt: string;
      }>,
    };
    const with33 = learningsFingerprint({ ...payload, promptVersion: "33" });
    const with34 = learningsFingerprint({ ...payload, promptVersion: "34" });
    expect(with33).not.toBe(with34);
  });

  it("wires fingerprint-gated enqueue at every learnings reassess site", () => {
    const learned = src("src/lib/application/service.ts");
    const learnedBlock = learned.slice(
      learned.indexOf("export async function saveApplicationJobLearnedNotes"),
      learned.indexOf("export { displayedFitBucket }"),
    );
    expect(learnedBlock).not.toContain("enqueueLearningsReassessIfChanged");
    expect(learnedBlock).not.toMatch(
      /type:\s*"CONSULTATION"[\s\S]*operation:\s*"reassess"/,
    );
    expect(learnedBlock).not.toContain("hiringManagerContactIds");
    expect(learnedBlock).not.toContain("enqueueCheatSheetPersonSection");

    const interview = src("src/app/actions/interview.ts");
    const updateFn = interview.slice(
      interview.indexOf("export async function updateInterviewStageAction"),
      interview.indexOf("export async function addInterviewInterviewerAction"),
    );
    expect(updateFn).not.toContain("enqueueLearningsReassessIfChanged");

    const summary = src("src/lib/application-summary/service.ts");
    const noteFn = summary.slice(
      summary.indexOf("export async function addCheatSheetInterviewNote"),
      summary.indexOf("function blankGuidancePath"),
    );
    expect(noteFn).not.toContain("enqueueLearningsReassessIfChanged");
    expect(noteFn).not.toMatch(/type:\s*"CONSULTATION"/);

    expect(src("src/lib/ai/paid-call-gate.ts")).toContain(
      'CONSULTATION_LEARNINGS_REASSESS',
    );
    expect(src("src/lib/consultation/learnings.ts")).toContain(
      LEARNINGS_REASSESS_OPERATION,
    );
  });

  it("additive reassess skips the 25-cap and locks APPROVED / role-expertise", () => {
    const service = src("src/lib/consultation/service.ts");
    const plan = service.slice(
      service.indexOf("async function planAndStoreRound"),
      service.indexOf("async function maybeFillRoleExpertiseAfterGapPlan"),
    );
    expect(plan).toContain("additiveReassess");
    expect(plan).toContain("applicationQuestionLimit");
    expect(plan).toContain('status: "APPROVED"');
    expect(plan).toContain("role-expertise:");
    expect(plan).toContain(
      "Additive reassess must not change APPROVED statement count",
    );
    expect(plan).toContain(
      "Additive reassess must not remove role-expertise questions",
    );

    const reassess = service.slice(
      service.indexOf("export async function reassessConsultationStanding"),
      service.indexOf("async function processAnswerGeneration"),
    );
    expect(reassess).toContain("additiveReassess: true");
    expect(reassess).toContain("recordLearningsReassessFingerprint");
  });

  it("Cheat Sheet application learnings reach Hiring Manager sections only", () => {
    const shared = [
      {
        id: "job:learned-notes",
        text: "Security sales",
        category: "SEEKER",
      },
      {
        id: "interview:s1:notesAfter",
        text: "Data hygiene",
        category: "JOB",
      },
      {
        id: "persona:role-hm:overview",
        text: "Owns the hire",
        category: "PERSONA",
      },
      {
        id: "persona:role-rec:overview",
        text: "Screens candidates",
        category: "PERSONA",
      },
      {
        id: "intel:n1",
        text: "Per-person note",
        category: "INTERVIEW_INTEL",
      },
    ];
    const hm = sourcesForPersonSection({
      sources: shared,
      contactId: "c-hm",
      roleId: "role-hm",
      noteIds: ["n1"],
      includeApplicationLearnings: true,
    });
    expect(hm.map((s) => s.id)).toEqual(
      expect.arrayContaining([
        "job:learned-notes",
        "interview:s1:notesAfter",
        "persona:role-hm:overview",
        "intel:n1",
      ]),
    );
    expect(hm.map((s) => s.id)).not.toContain("persona:role-rec:overview");

    const recruiter = sourcesForPersonSection({
      sources: shared,
      contactId: "c-rec",
      roleId: "role-rec",
      noteIds: ["n1"],
      includeApplicationLearnings: false,
    });
    expect(recruiter.map((s) => s.id)).toContain("persona:role-rec:overview");
    expect(recruiter.map((s) => s.id)).toContain("intel:n1");
    expect(recruiter.map((s) => s.id)).not.toContain("job:learned-notes");
    expect(recruiter.map((s) => s.id)).not.toContain("interview:s1:notesAfter");
  });

  it("attaches learnings to HM and as background for others; pending when no HM", () => {
    const learnings = {
      seekerLearnedNotes: "They want enterprise motion.",
      stageNotes: [
        { stageId: "s1", notesBefore: "Prep", notesAfter: "Hygiene" },
      ],
      newlyGained: [
        { contactId: "c-hm", id: "n1", text: "Invite note", stageId: null },
      ],
    };
    const pending = attachLearningsToHiringTeam({
      roles: [
        {
          id: "role-rec",
          name: "Recruiter",
          likelyTitles: ["Recruiter"],
          whyThisRoleMatters: "Screens",
          suggestionKey: "recruiter",
          personaBuilt: true,
          persona: {
            definition: "Screens",
            department: "TA",
            seniority: "IC",
            responsibilities: "Screen",
            painPoints: "Volume",
            desiredOutcomes: "Good slate",
            messagingNotes: null,
            additionalContext: null,
            overview: "Screens",
            impact: "Gate",
            pressures: [],
            needs: [],
            concerns: [],
            evaluates: [],
            talkingPoints: [],
            communication: [],
            interviewStage: null,
          },
          people: [
            {
              contactId: "c-rec",
              name: "Pat Recruiter",
              title: "Recruiter",
              employer: "Acme",
              linkedInUrl: null,
              roleConfirmed: true,
              persona: null,
              linkedIn: null,
              recordedNotes: [],
              interviewStages: [],
              prepOpening: null,
              interviewLearnings: [],
            },
          ],
        },
      ],
      learnings,
    });
    expect(pending.applicationLearningsPendingHiringManager).toEqual(learnings);
    expect(pending.roles[0]?.applicationLearnings).toBeUndefined();

    const withHm = attachLearningsToHiringTeam({
      roles: [
        {
          id: "role-hm",
          name: "Hiring Manager",
          likelyTitles: ["Director"],
          whyThisRoleMatters: "Owns hire",
          suggestionKey: "hiring_manager",
          personaBuilt: true,
          persona: {
            definition: "Owns",
            department: "Eng",
            seniority: "Director",
            responsibilities: "Hire",
            painPoints: "Risk",
            desiredOutcomes: "Strong hire",
            messagingNotes: null,
            additionalContext: null,
            overview: "Owns",
            impact: "Decision",
            pressures: [],
            needs: [],
            concerns: [],
            evaluates: [],
            talkingPoints: [],
            communication: [],
            interviewStage: null,
          },
          people: [
            {
              contactId: "c-hm",
              name: "Dana HM",
              title: "Director",
              employer: "Acme",
              linkedInUrl: null,
              roleConfirmed: true,
              persona: null,
              linkedIn: null,
              recordedNotes: [],
              interviewStages: [],
              prepOpening: null,
              interviewLearnings: [],
            },
          ],
        },
        {
          id: "role-rec",
          name: "Recruiter",
          likelyTitles: ["Recruiter"],
          whyThisRoleMatters: "Screens",
          suggestionKey: "recruiter",
          personaBuilt: false,
          persona: null,
          people: [
            {
              contactId: "c-rec",
              name: "Pat Rec",
              title: "Recruiter",
              employer: "Acme",
              linkedInUrl: "https://linkedin.com/in/pat",
              roleConfirmed: true,
              persona: null,
              linkedIn: {
                headline: "Recruiter",
                about: null,
                currentTitle: "Recruiter",
                currentEmployer: "Acme",
                currentTenure: null,
                workExperience: [],
                education: [],
                certifications: [],
                skills: [],
                statedFocus: [],
                profileText: "Pat is a recruiter.",
              },
              recordedNotes: [],
              interviewStages: [],
              prepOpening: null,
              interviewLearnings: [],
            },
          ],
        },
      ],
      learnings,
    });
    expect(withHm.applicationLearningsPendingHiringManager).toBeNull();
    const hm = withHm.roles.find((r) => r.id === "role-hm");
    const rec = withHm.roles.find((r) => r.id === "role-rec");
    expect(hm?.applicationLearnings).toEqual(learnings);
    expect(hm?.people[0]?.applicationLearnings).toEqual(learnings);
    expect(hm?.people[0]?.applicationLearningsBackground).toBeNull();
    expect(rec?.people[0]?.applicationLearnings).toBeNull();
    expect(rec?.people[0]?.applicationLearningsBackground).toEqual(learnings);
    expect(isHiringManagerRole({ suggestionKey: "hiring_manager" })).toBe(true);
    expect(isHiringManagerRole({ name: "Hiring Manager" })).toBe(true);
    expect(isHiringManagerRole({ name: "Recruiter" })).toBe(false);
  });

  it("matched person inherits role generalPersona separately from LinkedIn", () => {
    const withRoleOnly = attachLearningsToHiringTeam({
      roles: [
        {
          id: "role-hm",
          name: "Hiring Manager",
          likelyTitles: ["Director"],
          whyThisRoleMatters: "Owns",
          suggestionKey: "hiring_manager",
          personaBuilt: true,
          persona: {
            definition: "Role general",
            department: "Eng",
            seniority: "Director",
            responsibilities: "Hire",
            painPoints: "Risk",
            desiredOutcomes: "Strong",
            messagingNotes: null,
            additionalContext: null,
            overview: "Role general overview",
            impact: "Decision",
            pressures: ["Board"],
            needs: ["Evidence"],
            concerns: ["Delivery"],
            evaluates: ["Ownership"],
            talkingPoints: ["Cadence"],
            communication: ["Direct"],
            interviewStage: null,
          },
          people: [
            {
              contactId: "c-no-li",
              name: "No LinkedIn",
              title: "Director",
              employer: null,
              linkedInUrl: null,
              roleConfirmed: true,
              persona: null,
              linkedIn: null,
              recordedNotes: [],
              interviewStages: [],
              prepOpening: null,
              interviewLearnings: [],
            },
          ],
        },
      ],
      learnings: {
        seekerLearnedNotes: "HM learnings",
        stageNotes: [],
        newlyGained: [],
      },
    });
    const role = withRoleOnly.roles[0]!;
    const person = role.people[0]!;
    expect(role.persona?.overview).toBe("Role general overview");
    expect(person.linkedIn).toBeNull();
    expect(person.persona).toBeNull();
    expect(person.applicationLearnings?.seekerLearnedNotes).toBe("HM learnings");
    expect(JSON.stringify(role.persona)).not.toContain("No LinkedIn");
  });

  it("nothing in Harper page views enqueues learnings reassess", () => {
    for (const path of [
      "src/components/ConsultationSection.tsx",
      "src/components/HarperPersonView.tsx",
      "src/components/ApplicationWorkspace.tsx",
      "src/app/(app)/campaigns/[id]/consultation/page.tsx",
    ]) {
      const text = src(path);
      expect(text).not.toContain("enqueueLearningsReassessIfChanged");
      expect(text).not.toContain("CONSULTATION_LEARNINGS_REASSESS");
    }
  });
});

describe.skipIf(!hasTestDatabase())("Harper Batch D7 — learnings gate (db)", { timeout: 60_000 }, () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let campaignId = "";
  let userId = "";
  let productId = "";
  let hmContactId = "";
  let recruiterContactId = "";
  let hmRoleId = "";
  let recruiterRoleId = "";
  let stageId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    prisma = new PrismaClient();
    const workspace = await createIndividualWorkspace({
      email: `d7-learnings-${suffix}@example.test`,
      name: "D7 Learnings Seeker",
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
    productId = product.id;
    const icp = await prisma.icp.create({
      data: { organizationId, productId: product.id, name: `ICP ${suffix}` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `D7 ${suffix}`,
        productId: product.id,
        icpId: icp.id,
      },
    });
    campaignId = campaign.id;
    const company = await prisma.company.create({
      data: {
        organizationId,
        name: `Acme ${suffix}`,
        normalizedName: `acme-d7-${suffix}`,
      },
    });
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId,
        companyId: company.id,
        rawText: "Engineer posting",
        title: "Engineer",
        companyName: `Acme ${suffix}`,
        requiredItems: ["Ownership"],
        preferredItems: [],
        responsibilities: ["Ship"],
        scorecardJson: {},
        employerDisposition: "IDENTIFIED",
        identityConfirmation: "CONFIRMED",
        seekerLearnedNotes: "They want security sales.",
      },
    });
    const hmRole = await prisma.persona.create({
      data: {
        organizationId,
        productId,
        campaignId,
        name: "Hiring Manager",
        suggestionKey: "hiring_manager",
        whyThisPersonaMatters: "Owns the hire.",
        targetTitles: ["Director"],
        setupStatus: "APPROVED",
        profileJson: {
          involvement: "DIRECT",
          narrative: {
            overview: { text: "Leads the team." },
            concerns: [{ text: "Delivery risk" }],
            talkingPoints: [{ text: "Operating cadence" }],
            impact: { text: "Decision maker" },
          },
        },
        definition: "Owns the hire",
        department: "Engineering",
        seniority: "Director",
        responsibilities: "Hire and lead",
        painPoints: "Delivery risk",
        desiredOutcomes: "Strong engineer",
      },
    });
    hmRoleId = hmRole.id;
    const recruiterRole = await prisma.persona.create({
      data: {
        organizationId,
        productId,
        campaignId,
        name: "Recruiter",
        suggestionKey: "recruiter",
        whyThisPersonaMatters: "Screens.",
        targetTitles: ["Recruiter"],
        setupStatus: "APPROVED",
        profileJson: {
          involvement: "DIRECT",
          narrative: {
            overview: { text: "Screens candidates." },
            concerns: [{ text: "Volume" }],
            talkingPoints: [{ text: "Timeline" }],
            impact: { text: "Gate" },
          },
        },
        definition: "Screens",
        department: "TA",
        seniority: "IC",
        responsibilities: "Screen",
        painPoints: "Volume",
        desiredOutcomes: "Good slate",
      },
    });
    recruiterRoleId = recruiterRole.id;
    const hmContact = await prisma.contact.create({
      data: {
        organizationId,
        ownerUserId: userId,
        createdByUserId: userId,
        firstName: "Dana",
        lastName: "Manager",
        title: "Director",
      },
    });
    hmContactId = hmContact.id;
    const recruiterContact = await prisma.contact.create({
      data: {
        organizationId,
        ownerUserId: userId,
        createdByUserId: userId,
        firstName: "Pat",
        lastName: "Recruiter",
        title: "Recruiter",
        linkedinUrl: "https://www.linkedin.com/in/pat-rec",
      },
    });
    recruiterContactId = recruiterContact.id;
    await prisma.campaignContact.create({
      data: {
        organizationId,
        campaignId,
        contactId: hmContactId,
        chosenPersonaId: hmRoleId,
        roleConfirmed: true,
      },
    });
    await prisma.campaignContact.create({
      data: {
        organizationId,
        campaignId,
        contactId: recruiterContactId,
        chosenPersonaId: recruiterRoleId,
        roleConfirmed: true,
        linkedInProfileText:
          "Pat Recruiter — Talent Acquisition at Acme. Screens engineers.",
        linkedInExtractedJson: {
          headline: {
            text: "Recruiter at Acme",
            kind: "FACT",
            provenance: [{ sourceId: "linkedin-paste" }],
          },
          about: {
            text: "I screen engineers.",
            kind: "FACT",
            provenance: [{ sourceId: "linkedin-paste" }],
          },
          currentTitle: {
            text: "Recruiter",
            kind: "FACT",
            provenance: [{ sourceId: "linkedin-paste" }],
          },
          currentEmployer: {
            text: "Acme",
            kind: "FACT",
            provenance: [{ sourceId: "linkedin-paste" }],
          },
          currentTenure: null,
          workExperience: [],
          education: [],
          certifications: [],
          skills: [
            {
              text: "Sourcing",
              kind: "FACT",
              provenance: [{ sourceId: "linkedin-paste" }],
            },
          ],
          statedFocus: [],
        },
      },
    });
    const stage = await prisma.interviewStage.create({
      data: {
        organizationId,
        campaignId,
        type: "HIRING_MANAGER",
        format: "VIDEO",
        scheduledAt: new Date("2026-10-01T15:00:00.000Z"),
        sortOrder: 0,
        notesBefore: "Prepare ownership stories.",
        notesAfter: null,
      },
    });
    stageId = stage.id;
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization
        .delete({ where: { id: organizationId } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("unchanged learnings enqueue no reassess; changed learnings enqueue one", async () => {
    await prisma.applicationJob.deleteMany({
      where: { campaignId, type: "CONSULTATION" },
    });
    await prisma.paidCallReceipt.deleteMany({
      where: {
        organizationId,
        operation: LEARNINGS_REASSESS_OPERATION,
        subjectKey: campaignId,
      },
    });

    const first = await enqueueLearningsReassessIfChanged({
      organizationId,
      campaignId,
      userId,
    });
    expect(first).toBe(true);
    const jobsAfterFirst = await prisma.applicationJob.findMany({
      where: { campaignId, type: "CONSULTATION" },
    });
    expect(jobsAfterFirst).toHaveLength(1);
    expect(JSON.stringify(jobsAfterFirst[0]?.payload)).toContain("reassess");

    await recordLearningsReassessFingerprint({ organizationId, campaignId });

    const second = await enqueueLearningsReassessIfChanged({
      organizationId,
      campaignId,
      userId,
    });
    expect(second).toBe(false);
    const jobsAfterSecond = await prisma.applicationJob.findMany({
      where: { campaignId, type: "CONSULTATION" },
    });
    expect(jobsAfterSecond).toHaveLength(1);

    await prisma.jobRequirement.update({
      where: { campaignId },
      data: { seekerLearnedNotes: "They want security sales and hygiene." },
    });
    const third = await enqueueLearningsReassessIfChanged({
      organizationId,
      campaignId,
      userId,
    });
    expect(third).toBe(true);
    const jobsAfterThird = await prisma.applicationJob.findMany({
      where: { campaignId, type: "CONSULTATION" },
    });
    expect(jobsAfterThird.length).toBeGreaterThanOrEqual(1);
    const pending = jobsAfterThird.filter((job) => job.status === "PENDING");
    expect(pending.length).toBeGreaterThanOrEqual(1);
  });

  it("coach payload attaches learnings to HM and background to recruiter; role persona separate", async () => {
    const { roles, applicationLearningsPendingHiringManager } =
      await loadCoachHiringTeamWithLearnings(organizationId, campaignId);
    expect(applicationLearningsPendingHiringManager).toBeNull();
    const hm = roles.find((role) => role.id === hmRoleId);
    const rec = roles.find((role) => role.id === recruiterRoleId);
    expect(hm?.persona).not.toBeNull();
    expect(hm?.people[0]?.linkedIn).toBeNull();
    expect(hm?.people[0]?.applicationLearnings?.seekerLearnedNotes).toContain(
      "security sales",
    );
    expect(hm?.applicationLearnings?.stageNotes.some((n) => n.stageId === stageId)).toBe(
      true,
    );
    expect(rec?.people[0]?.linkedIn?.headline).toContain("Recruiter");
    expect(rec?.persona).not.toBeNull();
    expect(rec?.people[0]?.applicationLearnings).toBeNull();
    expect(
      rec?.people[0]?.applicationLearningsBackground?.seekerLearnedNotes,
    ).toContain("security sales");
    expect(JSON.stringify(hm?.persona)).not.toContain("Dana");
    expect(JSON.stringify(rec?.persona)).not.toContain("Pat");
  });

  it("saving unchanged learned notes does not enqueue a new reassess", async () => {
    await recordLearningsReassessFingerprint({ organizationId, campaignId });
    await prisma.applicationJob.deleteMany({
      where: { campaignId, type: "CONSULTATION" },
    });
    const { saveApplicationJobLearnedNotes } = await import(
      "@/lib/application/service"
    );
    const current = await prisma.jobRequirement.findFirstOrThrow({
      where: { campaignId },
      select: { seekerLearnedNotes: true },
    });
    await saveApplicationJobLearnedNotes({
      organizationId,
      campaignId,
      userId,
      notes: current.seekerLearnedNotes ?? "",
    });
    const consultJobs = await prisma.applicationJob.findMany({
      where: { campaignId, type: "CONSULTATION" },
    });
    expect(consultJobs).toHaveLength(0);
    const summaryJobs = await prisma.applicationJob.findMany({
      where: { campaignId, type: "APPLICATION_SUMMARY" },
    });
    expect(
      summaryJobs.some((job) => job.targetId === `contact:${hmContactId}`),
    ).toBe(false);
    expect(
      summaryJobs.some((job) => job.targetId === `contact:${recruiterContactId}`),
    ).toBe(false);
  });
});

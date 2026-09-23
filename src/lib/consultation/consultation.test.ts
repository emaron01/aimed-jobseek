import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  assessEvidence,
  evidenceTargets,
  gapsAreCovered,
  profileFactEvidence,
} from "@/lib/consultation/assess";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import {
  answerHasResult,
  planQuestionRound,
  resultFollowUpQuestion,
  seniorityWarrantsChronology,
} from "@/lib/consultation/questions";
import { nextConsultationStatus } from "@/lib/consultation/state";
import {
  answerConsultationQuestion,
  completeConsultation,
  confirmConsultationProposal,
  dismissConsultationProposal,
  pauseConsultation,
  resumeConsultation,
  skipConsultation,
  skipConsultationQuestion,
  startConsultation,
} from "@/lib/consultation/service";
import {
  appendConfirmedFact,
  groundedInAnswer,
  proposalsFromAnswer,
  reassessProfile,
} from "@/lib/consultation/write-back";
import { normalizeParsedJobRequirement } from "@/lib/job-requirement/normalize";
import {
  NORMAL_JOB_MODEL,
  NORMAL_JOB_POSTING,
} from "@/lib/job-requirement/fixtures";
import { consultationConfig } from "@/lib/product-config/consultation";
import { CONSULTATION_COACH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/consultation";
import {
  parseCandidateProfile,
  type CandidateProfile,
} from "@/lib/product-research/candidate-profile";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";
import { hasTestDatabase } from "@/test/database";

function sample() {
  const profile = fixtureAlexChenProfile();
  const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
  const targets = evidenceTargets({
    requiredItems: parsed.requiredItems,
    preferredItems: parsed.preferredItems,
    scorecard: parsed.scorecard,
  });
  const assessments = assessEvidence({
    targets,
    facts: profileFactEvidence(profile),
  });
  return { profile, parsed, targets, assessments };
}

describe("consultation evidence and questions", () => {
  it("never counts INFERENCE items or compensation as evidence", () => {
    const { profile, targets } = sample();
    const python = targets.find((item) => item.text === "5 years of Python");
    expect(python).toBeTruthy();
    const inferenceProfile = parseCandidateProfile({
      ...profile,
      positioning: {
        id: "id_positioning",
        kind: "INFERENCE",
        text: "5 years of Python",
        provenance: [],
      },
      compensation: {
        id: "comp_1",
        kind: "FACT",
        text: "5 years of Python",
        provenance: [{ sourceId: "src_resume_alex_chen" }],
      },
    });
    const facts = profileFactEvidence(inferenceProfile);
    expect(facts.some((fact) => fact.id === "id_positioning")).toBe(false);
    expect(facts.some((fact) => fact.id === "comp_1")).toBe(false);
    const assessed = assessEvidence({
      targets: [python!],
      facts,
    });
    expect(assessed[0]?.strength).toBe("NONE");
    expect(assessed[0]?.supportingFactIds).toEqual([]);
  });

  it("assesses the fixture resume against the normal posting", () => {
    const { assessments } = sample();
    const byText = (text: string) =>
      assessments.filter((item) => item.text === text);
    const python = byText("5 years of Python");
    expect(python.length).toBeGreaterThan(0);
    expect(python.every((item) => item.strength === "NONE")).toBe(true);
    expect(python.every((item) => item.strategy === "ACKNOWLEDGE")).toBe(true);
    expect(python.every((item) => item.supportingFactIds.length === 0)).toBe(true);

    const incident = assessments.find((item) => item.text === "Leads incident response");
    expect(incident?.strength).toBe("STRONG");
    expect(incident?.supportingFactIds).toContain("skill_4");
    expect(incident?.strategy).toBeNull();

    const production = assessments.find(
      (item) => item.text === "Experience shipping production services",
    );
    expect(production?.strength).toBe("NONE");
    expect(production?.strategy).toBe("REFRAME_ADJACENT");

    const mission = assessments.find((item) => item.kind === "MISSION");
    expect(mission?.text).toBe("make warehouse robots reliable");
    expect(mission?.strength).toBe("NONE");
    expect(mission?.strategy).toBe("ACKNOWLEDGE");

    const preferred = assessments.find((item) => item.kind === "PREFERRED");
    expect(preferred?.text).toBe("ROS2 experience");
    expect(preferred?.strength).toBe("NONE");
  });

  it("asks required gaps before preferred gaps and follows up for a missing result", () => {
    const { assessments, profile } = sample();
    const round = planQuestionRound({
      assessments,
      askedKeys: new Set(),
      skippedKeys: new Set(),
      includeChronology: seniorityWarrantsChronology({
        seniority: "Senior",
        title: "Senior Product Engineer",
      }),
      chronologyAsked: false,
      recentRole: {
        title: profile.experience[0]?.title ?? null,
        employer: profile.experience[0]?.employer ?? null,
      },
      hiringTeamNote: "Director of Engineering will care about this: shipping reliability",
    });
    expect(round.length).toBeLessThanOrEqual(consultationConfig.roundSize);
    expect(round[0]?.targetKey.startsWith("required:")).toBe(true);
    expect(round[0]?.text).toContain("5 years of Python");
    expect(round.some((question) => question.text.includes("ROS2"))).toBe(false);
    expect(round.some((question) => question.targetKey === "chronology")).toBe(true);
    expect(round.at(-1)?.text).toContain("Northwind Analytics");
    expect(answerHasResult("I have used Python on backend services.")).toBe(false);
    const followUp = resultFollowUpQuestion("5 years of Python");
    expect(followUp).toContain("concrete result");
    expect(followUp).toContain("5 years of Python");
  });

  it("writes nothing until a fact is confirmed, then stores provenance and updates the assessment", () => {
    const { profile, targets } = sample();
    const before = JSON.stringify(profile);
    const answer =
      "At Northwind I owned the billing service. I cut failed billing runs from 8% to under 1%.";
    const proposals = proposalsFromAnswer({
      answer,
      turnId: "turn_answer_1",
      competencies: targets
        .filter((item) => item.kind === "COMPETENCY")
        .map((item) => ({ id: item.key, text: item.text })),
      allowWithoutResult: false,
    });
    expect(JSON.stringify(profile)).toBe(before);
    expect(proposals.some((item) => item.kind === "FACT")).toBe(true);
    expect(proposals.every((item) => groundedInAnswer(item.text, answer))).toBe(true);
    expect(groundedInAnswer("Invented a 40% Python win", answer)).toBe(false);

    const fact = proposals.find((item) => item.kind === "FACT");
    const story = proposals.find((item) => item.kind === "STORY");
    expect(fact?.profileItemId).toBe("consult_turn_answer_1_fact");
    expect(story?.story?.competencyLinks.some((link) => link.text.includes("incident"))).toBe(
      false,
    );

    const incidentAnswer =
      "I led incident response for the payments service. I cut failed pages from 12 a week to 2.";
    const incidentStory = proposalsFromAnswer({
      answer: incidentAnswer,
      turnId: "turn_answer_2",
      competencies: targets
        .filter((item) => item.kind === "COMPETENCY")
        .map((item) => ({ id: item.key, text: item.text })),
      allowWithoutResult: false,
    }).find((item) => item.kind === "STORY");
    expect(
      incidentStory?.story?.competencyLinks.some((link) =>
        link.text.toLowerCase().includes("incident response"),
      ),
    ).toBe(true);

    const confirmed = appendConfirmedFact(profile, {
      id: "consult_turn_answer_1_fact",
      text: "I cut failed billing runs from 8% to under 1%.",
      turnId: "turn_answer_1",
    });
    const written = confirmed.experience
      .flatMap((role) => role.achievements)
      .find((item) => item.id === "consult_turn_answer_1_fact");
    expect(written?.kind).toBe("FACT");
    expect(written?.provenance).toEqual([{ sourceId: "turn_answer_1" }]);
    expect(confirmed.experience[0]?.id).toBe("role_1");
    expect(
      confirmed.experience[0]?.achievements.some(
        (item) => item.id === "consult_turn_answer_1_fact",
      ),
    ).toBe(true);

    const python = targets.find(
      (item) => item.kind === "REQUIRED" && item.text === "5 years of Python",
    )!;
    const beforePython = assessEvidence({
      targets: [python],
      facts: profileFactEvidence(profile),
    })[0];
    expect(beforePython?.strength).toBe("NONE");
    const withPython = appendConfirmedFact(profile, {
      id: "consult_python",
      text: "5 years of Python",
      turnId: "turn_python",
    });
    const afterPython = reassessProfile({
      profile: withPython,
      targets: [python],
    })[0];
    expect(afterPython?.strength).toBe("STRONG");
    expect(afterPython?.supportingFactIds).toContain("consult_python");
  });

  it("covers skip, pause, resume, and done", () => {
    expect(nextConsultationStatus("IN_PROGRESS", "pause")).toBe("PAUSED");
    expect(nextConsultationStatus("PAUSED", "resume")).toBe("IN_PROGRESS");
    expect(nextConsultationStatus("SKIPPED", "resume")).toBe("IN_PROGRESS");
    expect(nextConsultationStatus("IN_PROGRESS", "skip")).toBe("SKIPPED");
    expect(nextConsultationStatus("IN_PROGRESS", "done")).toBe("DONE");
    expect(nextConsultationStatus("PAUSED", "done")).toBe("DONE");
    expect(() => nextConsultationStatus("DONE", "pause")).toThrow(/already done/);
    expect(() => nextConsultationStatus("SKIPPED", "done")).toThrow(/skip/);
    expect(() => nextConsultationStatus("PAUSED", "pause")).toThrow(/in-progress/);
    const { assessments } = sample();
    const skipped = new Set(
      assessments.filter((item) => item.kind !== "PREFERRED").map((item) => item.key),
    );
    expect(gapsAreCovered(assessments, skipped)).toBe(true);
    expect(gapsAreCovered(assessments, new Set())).toBe(false);
  });

  it("names the consultant from product configuration and keeps prompt content honest", () => {
    expect(consultationConfig.displayName).toBe("Avery");
    expect(CONSULTATION_PROMPT_VERSION).toBe("1");
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain("coach, not an interrogator");
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain("Never inflate fit");
    const workspace = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    expect(workspace).toContain("consultationConfig.displayName");
    expect(workspace).not.toContain("Avery");
  });
});

describe.skipIf(!hasTestDatabase())("consultation session", () => {
  const suffix = Date.now().toString(36);
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let userId = "";
  let productId = "";
  let icpId = "";
  let campaignId = "";
  const profile = fixtureAlexChenProfile();

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    const org = await prisma.organization.create({
      data: { name: `[TEST] Consultation ${suffix}`, slug: `consultation-${suffix}` },
    });
    organizationId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `consultation-${suffix}@example.test`,
        emailNormalized: `consultation-${suffix}@example.test`,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Profile ${suffix}`,
        profileJson: profile,
      },
    });
    productId = product.id;
    const icp = await prisma.icp.create({
      data: { organizationId, productId, name: `Employer ${suffix}` },
    });
    icpId = icp.id;
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Application ${suffix}`,
        productId,
        icpId,
      },
    });
    campaignId = campaign.id;
    const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        companyName: parsed.companyName,
        seniority: parsed.seniority,
        reportingLine: parsed.reportingLine,
        responsibilities: parsed.responsibilities,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
      },
    });
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

  it("runs a round, keeps answers off the profile until confirmation, and updates evidence", async () => {
    await startConsultation({ organizationId, campaignId });
    const session = await prisma.consultationSession.findUnique({
      where: { campaignId },
      include: { assessments: true, turns: { orderBy: { sequence: "asc" } } },
    });
    expect(session?.promptVersion).toBe("1");
    expect(session?.status).toBe("IN_PROGRESS");
    const incident = session?.assessments.find((item) => item.text === "Leads incident response");
    expect(incident?.strength).toBe("STRONG");
    expect(incident?.supportingFactIds).toEqual(expect.arrayContaining(["skill_4"]));
    const first = session?.turns[0];
    expect(first?.speaker).toBe("CONSULTANT");
    expect(first?.targetKey?.startsWith("required:")).toBe(true);
    expect(first?.body).toContain("5 years of Python");
    expect(session?.turns.some((turn) => turn.body.includes("ROS2"))).toBe(false);

    const storedBefore = await prisma.product.findUnique({ where: { id: productId } });
    await answerConsultationQuestion({
      organizationId,
      campaignId,
      targetKey: first!.targetKey!,
      answer: "I have used Python on backend services.",
    });
    const afterAnswer = await prisma.product.findUnique({ where: { id: productId } });
    expect(afterAnswer?.profileJson).toEqual(storedBefore?.profileJson);
    const followUps = await prisma.consultationTurn.findMany({
      where: { sessionId: session!.id, followUp: true, speaker: "CONSULTANT" },
    });
    expect(followUps[0]?.body).toContain("concrete result");
    expect(await prisma.consultationProposal.count({ where: { sessionId: session!.id } })).toBe(0);

    await answerConsultationQuestion({
      organizationId,
      campaignId,
      targetKey: first!.targetKey!,
      answer: "I used Python for 5 years and cut failed jobs by 40%.",
    });
    const stillUnwritten = await prisma.product.findUnique({ where: { id: productId } });
    expect(stillUnwritten?.profileJson).toEqual(storedBefore?.profileJson);
    const proposals = await prisma.consultationProposal.findMany({
      where: { sessionId: session!.id, status: "PENDING" },
    });
    const fact = proposals.find((item) => item.kind === "FACT");
    const story = proposals.find((item) => item.kind === "STORY");
    expect(fact).toBeTruthy();
    const seeker = await prisma.consultationTurn.findFirst({
      where: { sessionId: session!.id, speaker: "SEEKER", skipped: false },
      orderBy: { sequence: "desc" },
    });
    expect(seeker?.body).toBe("I used Python for 5 years and cut failed jobs by 40%.");
    expect(seeker?.seekerAuthored).toBe(true);

    await confirmConsultationProposal({
      organizationId,
      proposalId: fact!.id,
      text: fact!.text,
      situation: null,
      task: null,
      action: null,
      result: null,
    });
    const written = parseCandidateProfile(
      (await prisma.product.findUnique({ where: { id: productId } }))?.profileJson,
    );
    const saved = written.experience
      .flatMap((role) => role.achievements)
      .find((item) => item.id === fact!.profileItemId);
    expect(saved?.provenance).toEqual([{ sourceId: seeker!.id }]);
    const python = await prisma.consultationAssessment.findFirst({
      where: { sessionId: session!.id, text: "5 years of Python", kind: "REQUIRED" },
    });
    expect(python?.strength).toBe("STRONG");
    expect(python?.supportingFactIds).toEqual(
      expect.arrayContaining([fact!.profileItemId]),
    );

    if (story) {
      const links = story.competencyLinks;
      expect(JSON.stringify(links).toLowerCase()).toContain("python");
      await confirmConsultationProposal({
        organizationId,
        proposalId: story.id,
        text: story.text,
        situation: "I used Python for 5 years and cut failed jobs by 40%.",
        task: "I used Python for 5 years and cut failed jobs by 40%.",
        action: "I used Python for 5 years and cut failed jobs by 40%.",
        result: "I used Python for 5 years and cut failed jobs by 40%.",
      });
      const bank = await prisma.profileStory.findFirst({
        where: { productId, consultationTurnId: seeker!.id },
      });
      expect(bank?.seekerAuthored).toBe(true);
      expect(JSON.stringify(bank?.competencyLinks).toLowerCase()).toContain("python");
    }
  });

  it("dismisses a proposal without writing the Personal Profile", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Dismiss ${suffix}`,
        productId,
        icpId,
      },
    });
    const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        seniority: parsed.seniority,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
      },
    });
    const before = await prisma.product.findUnique({ where: { id: productId } });
    const storiesBefore = await prisma.profileStory.count({ where: { productId } });
    await startConsultation({ organizationId, campaignId: campaign.id });
    const question = await prisma.consultationTurn.findFirst({
      where: { session: { campaignId: campaign.id }, speaker: "CONSULTANT" },
      orderBy: { sequence: "asc" },
    });
    await answerConsultationQuestion({
      organizationId,
      campaignId: campaign.id,
      targetKey: question!.targetKey!,
      answer: "I used Python for 5 years and cut failed jobs by 40%.",
    });
    const pending = await prisma.consultationProposal.findMany({
      where: { session: { campaignId: campaign.id }, status: "PENDING" },
    });
    expect(pending.length).toBeGreaterThan(0);
    for (const proposal of pending) {
      await dismissConsultationProposal({ organizationId, proposalId: proposal.id });
    }
    const after = await prisma.product.findUnique({ where: { id: productId } });
    expect(after?.profileJson).toEqual(before?.profileJson);
    expect(await prisma.profileStory.count({ where: { productId } })).toBe(storiesBefore);
    const dismissed = await prisma.consultationProposal.findMany({
      where: { session: { campaignId: campaign.id } },
    });
    expect(dismissed.every((item) => item.status === "DISMISSED")).toBe(true);
  });

  it("pauses, resumes, skips a question, and marks done without blocking a skipped application", async () => {
    await pauseConsultation({ organizationId, campaignId });
    expect(
      (await prisma.consultationSession.findUnique({ where: { campaignId } }))?.status,
    ).toBe("PAUSED");
    await resumeConsultation({ organizationId, campaignId });
    expect(
      (await prisma.consultationSession.findUnique({ where: { campaignId } }))?.status,
    ).toBe("IN_PROGRESS");

    const turns = await prisma.consultationTurn.findMany({
      where: { session: { campaignId } },
      orderBy: { sequence: "asc" },
    });
    const target = [...turns]
      .reverse()
      .find((turn) => {
        if (turn.speaker !== "CONSULTANT" || !turn.targetKey) return false;
        return !turns.some(
          (other) =>
            other.speaker === "SEEKER" &&
            other.targetKey === turn.targetKey &&
            other.sequence > turn.sequence,
        );
      });
    if (target?.targetKey) {
      await skipConsultationQuestion({
        organizationId,
        campaignId,
        targetKey: target.targetKey,
      });
      const skipped = await prisma.consultationTurn.findFirst({
        where: { session: { campaignId }, speaker: "SEEKER", skipped: true, targetKey: target.targetKey },
      });
      expect(skipped?.seekerAuthored).toBe(true);
    }

    await completeConsultation({ organizationId, campaignId });
    expect(
      (await prisma.consultationSession.findUnique({ where: { campaignId } }))?.status,
    ).toBe("DONE");

    const other = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Skipped ${suffix}`,
        productId,
        icpId,
      },
    });
    const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: other.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
      },
    });
    expect(await prisma.consultationSession.findUnique({ where: { campaignId: other.id } })).toBeNull();
    await skipConsultation({ organizationId, campaignId: other.id });
    const skippedSession = await prisma.consultationSession.findUnique({
      where: { campaignId: other.id },
    });
    expect(skippedSession?.status).toBe("SKIPPED");
    expect(skippedSession?.coachNote).toContain("Personal Profile");
    await resumeConsultation({ organizationId, campaignId: other.id });
    expect(
      (await prisma.consultationSession.findUnique({ where: { campaignId: other.id } }))?.status,
    ).toBe("IN_PROGRESS");
  });
});

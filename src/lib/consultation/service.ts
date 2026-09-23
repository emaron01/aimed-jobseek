import type { JobScorecard, ScorecardItem } from "@/lib/job-requirement/types";
import { writeCoachNote, extractWithModel } from "@/lib/consultation/ai";
import {
  assessEvidence,
  evidenceTargets,
  gapsAreCovered,
  profileFactEvidence,
  type EvidenceAssessment,
  type EvidenceTarget,
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
  appendConfirmedFact,
  groundedInAnswer,
  latestFactExperience,
  proposalsFromAnswer,
  reassessProfile,
  type ProposalDraft,
} from "@/lib/consultation/write-back";
import { prisma } from "@/lib/prisma";
import { consultationConfig, vocab } from "@/lib/product-config";
import {
  emptyCandidateProfile,
  parseCandidateProfile,
  parseCandidateProfileSafe,
} from "@/lib/product-research/candidate-profile";
import { parseStringArray } from "@/lib/research";
import { TenantError } from "@/lib/tenant/errors";

function readScorecard(value: unknown): JobScorecard {
  if (!value || typeof value !== "object") {
    return { mission: null, outcomes: [], competencies: [] };
  }
  const row = value as Partial<JobScorecard>;
  const item = (entry: unknown): ScorecardItem | null => {
    if (!entry || typeof entry !== "object") return null;
    const candidate = entry as Partial<ScorecardItem>;
    if (typeof candidate.text !== "string" || !candidate.text.trim()) return null;
    if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
    return {
      id: candidate.id,
      text: candidate.text,
      inferred: candidate.inferred === true,
    };
  };
  return {
    mission: item(row.mission),
    outcomes: Array.isArray(row.outcomes)
      ? row.outcomes.map(item).filter((entry): entry is ScorecardItem => Boolean(entry))
      : [],
    competencies: Array.isArray(row.competencies)
      ? row.competencies.map(item).filter((entry): entry is ScorecardItem => Boolean(entry))
      : [],
  };
}

async function requireApplication(organizationId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    select: { id: true, productId: true },
  });
  if (!campaign) {
    throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  }
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaignId, organizationId },
  });
  if (!requirement) {
    throw new TenantError(
      `This ${vocab.campaign.singular} has no job requirement yet.`,
    );
  }
  const product = await prisma.product.findFirst({
    where: { id: campaign.productId, organizationId },
  });
  if (!product) {
    throw new TenantError(`${vocab.product.Singular} was not found.`);
  }
  const parsed = product.profileJson
    ? parseCandidateProfileSafe(product.profileJson)
    : { ok: true as const, profile: emptyCandidateProfile() };
  if (!parsed.ok) {
    throw new TenantError(
      `The ${vocab.product.singular} could not be read, so consultation did not start.`,
    );
  }
  return { campaign, requirement, product, profile: parsed.profile };
}

function targetsFromRequirement(requirement: {
  requiredItems: unknown;
  preferredItems: unknown;
  scorecardJson: unknown;
}): EvidenceTarget[] {
  return evidenceTargets({
    requiredItems: parseStringArray(requirement.requiredItems),
    preferredItems: parseStringArray(requirement.preferredItems),
    scorecard: readScorecard(requirement.scorecardJson),
  });
}

async function hiringTeam(
  organizationId: string,
  campaignId: string,
): Promise<Array<{ name: string; whyThisRoleMatters: string | null }>> {
  const roles = await prisma.persona.findMany({
    where: { organizationId, campaignId, archivedAt: null },
    orderBy: { createdAt: "asc" },
    select: { name: true, whyThisPersonaMatters: true },
  });
  return roles.map((role) => ({
    name: role.name,
    whyThisRoleMatters: role.whyThisPersonaMatters,
  }));
}

function hiringTeamNote(
  roles: Array<{ name: string; whyThisRoleMatters: string | null }>,
): string | null {
  const role = roles.find((item) => item.whyThisRoleMatters?.trim()) ?? roles[0];
  if (!role) return null;
  const why = role.whyThisRoleMatters?.trim();
  return why
    ? `${role.name} will care about this: ${why}`
    : `${role.name} will care about this in their interview.`;
}

async function saveAssessments(
  organizationId: string,
  sessionId: string,
  assessments: EvidenceAssessment[],
) {
  for (const assessment of assessments) {
    await prisma.consultationAssessment.upsert({
      where: {
        sessionId_targetKey: { sessionId, targetKey: assessment.key },
      },
      create: {
        organizationId,
        sessionId,
        targetKey: assessment.key,
        kind: assessment.kind,
        text: assessment.text,
        strength: assessment.strength,
        supportingFactIds: assessment.supportingFactIds,
        strategy: assessment.strategy,
      },
      update: {
        kind: assessment.kind,
        text: assessment.text,
        strength: assessment.strength,
        supportingFactIds: assessment.supportingFactIds,
        strategy: assessment.strategy,
      },
    });
  }
}

async function nextSequence(sessionId: string): Promise<number> {
  const latest = await prisma.consultationTurn.findFirst({
    where: { sessionId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  return (latest?.sequence ?? 0) + 1;
}

async function addTurn(input: {
  organizationId: string;
  sessionId: string;
  speaker: "CONSULTANT" | "SEEKER";
  body: string;
  targetKey: string | null;
  followUp?: boolean;
  skipped?: boolean;
  seekerAuthored?: boolean;
}) {
  const sequence = await nextSequence(input.sessionId);
  return prisma.consultationTurn.create({
    data: {
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      sequence,
      speaker: input.speaker,
      body: input.body,
      targetKey: input.targetKey,
      followUp: input.followUp ?? false,
      skipped: input.skipped ?? false,
      seekerAuthored: input.seekerAuthored ?? false,
    },
  });
}

async function planAndStoreRound(input: {
  organizationId: string;
  sessionId: string;
  assessments: EvidenceAssessment[];
  askedKeys: Set<string>;
  skippedKeys: Set<string>;
  profile: ReturnType<typeof parseCandidateProfile>;
  requirement: { seniority: string | null; title: string | null };
  roles: Array<{ name: string; whyThisRoleMatters: string | null }>;
}) {
  const recent = latestFactExperience(input.profile);
  const questions = planQuestionRound({
    assessments: input.assessments,
    askedKeys: input.askedKeys,
    skippedKeys: input.skippedKeys,
    includeChronology: seniorityWarrantsChronology({
      seniority: input.requirement.seniority,
      title: input.requirement.title,
    }),
    chronologyAsked: input.askedKeys.has("chronology"),
    recentRole: recent
      ? { title: recent.title ?? null, employer: recent.employer ?? null }
      : null,
    hiringTeamNote: hiringTeamNote(input.roles),
  });
  for (const question of questions) {
    await addTurn({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      speaker: "CONSULTANT",
      body: question.text,
      targetKey: question.targetKey,
      followUp: question.followUp,
    });
  }
  const coach = await writeCoachNote({
    questions,
    gaps: input.assessments
      .filter((item) => item.strength !== "STRONG")
      .map((item) => ({
        text: item.text,
        strength: item.strength,
        strategy: item.strategy,
      })),
    hiringTeam: input.roles,
    stretch: input.assessments.some(
      (item) => item.kind === "REQUIRED" && item.strength === "NONE",
    ),
  });
  await prisma.consultationSession.update({
    where: { id: input.sessionId },
    data: { coachNote: coach.ok ? coach.commentary : coach.message },
  });
  return questions;
}

function askedAndSkipped(
  turns: Array<{
    speaker: "CONSULTANT" | "SEEKER";
    targetKey: string | null;
    skipped: boolean;
  }>,
) {
  const askedKeys = new Set<string>();
  const skippedKeys = new Set<string>();
  for (const turn of turns) {
    if (turn.speaker === "CONSULTANT" && turn.targetKey) askedKeys.add(turn.targetKey);
    if (turn.speaker === "SEEKER" && turn.skipped && turn.targetKey) {
      skippedKeys.add(turn.targetKey);
    }
  }
  return { askedKeys, skippedKeys };
}

export async function startConsultation(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const { campaign, requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const existing = await prisma.consultationSession.findUnique({
    where: { campaignId: input.campaignId },
  });
  if (existing?.status === "DONE" || existing?.status === "IN_PROGRESS") return;
  if (existing) {
    const status = nextConsultationStatus(existing.status, "resume");
    await prisma.consultationSession.update({
      where: { id: existing.id },
      data: { status },
    });
    return;
  }
  const targets = targetsFromRequirement(requirement);
  const assessments = assessEvidence({
    targets,
    facts: profileFactEvidence(profile),
  });
  const session = await prisma.consultationSession.create({
    data: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      productId: campaign.productId,
      status: "IN_PROGRESS",
      promptVersion: CONSULTATION_PROMPT_VERSION,
    },
  });
  await saveAssessments(input.organizationId, session.id, assessments);
  const roles = await hiringTeam(input.organizationId, input.campaignId);
  await planAndStoreRound({
    organizationId: input.organizationId,
    sessionId: session.id,
    assessments,
    askedKeys: new Set(),
    skippedKeys: new Set(),
    profile,
    requirement,
    roles,
  });
}

async function setStatus(input: {
  organizationId: string;
  campaignId: string;
  command: "pause" | "resume" | "skip" | "done";
}) {
  const session = await prisma.consultationSession.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!session) throw new TenantError("Start the consultation before changing it.");
  let status;
  try {
    status = nextConsultationStatus(session.status, input.command);
  } catch (error) {
    throw new TenantError(
      error instanceof Error ? error.message : "That consultation change is not available.",
    );
  }
  await prisma.consultationSession.update({
    where: { id: session.id },
    data: { status },
  });
}

export async function pauseConsultation(input: {
  organizationId: string;
  campaignId: string;
}) {
  await setStatus({ ...input, command: "pause" });
}

export async function resumeConsultation(input: {
  organizationId: string;
  campaignId: string;
}) {
  await setStatus({ ...input, command: "resume" });
}

export async function skipConsultation(input: {
  organizationId: string;
  campaignId: string;
}) {
  const existing = await prisma.consultationSession.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!existing) {
    const { campaign } = await requireApplication(
      input.organizationId,
      input.campaignId,
    );
    await prisma.consultationSession.create({
      data: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        productId: campaign.productId,
        status: "SKIPPED",
        promptVersion: CONSULTATION_PROMPT_VERSION,
        coachNote: `Skipped. Materials can still be generated from the ${vocab.product.singular} alone.`,
      },
    });
    return;
  }
  await setStatus({ ...input, command: "skip" });
}

export async function completeConsultation(input: {
  organizationId: string;
  campaignId: string;
}) {
  await setStatus({ ...input, command: "done" });
}

async function loadSessionTurns(sessionId: string) {
  return prisma.consultationTurn.findMany({
    where: { sessionId },
    orderBy: { sequence: "asc" },
  });
}

function unanswered(
  turns: Array<{
    id: string;
    sequence: number;
    speaker: "CONSULTANT" | "SEEKER";
    targetKey: string | null;
    followUp: boolean;
    body: string;
  }>,
  targetKey: string,
) {
  const questions = turns.filter(
    (turn) => turn.speaker === "CONSULTANT" && turn.targetKey === targetKey,
  );
  const latest = questions.at(-1);
  if (!latest) return null;
  const answered = turns.some(
    (turn) =>
      turn.speaker === "SEEKER" &&
      turn.targetKey === targetKey &&
      turn.sequence > latest.sequence,
  );
  return answered ? null : latest;
}

export async function answerConsultationQuestion(input: {
  organizationId: string;
  campaignId: string;
  targetKey: string;
  answer: string;
}): Promise<void> {
  const answer = input.answer.trim();
  if (!answer) throw new TenantError("Write an answer, or skip the question.");
  const session = await prisma.consultationSession.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!session || session.status !== "IN_PROGRESS") {
    throw new TenantError("The consultation is not waiting for an answer.");
  }
  const turns = await loadSessionTurns(session.id);
  const question = unanswered(turns, input.targetKey);
  if (!question) throw new TenantError("That question is not open.");
  const seekerTurn = await addTurn({
    organizationId: input.organizationId,
    sessionId: session.id,
    speaker: "SEEKER",
    body: answer,
    targetKey: input.targetKey,
    seekerAuthored: true,
  });
  const { requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const targets = targetsFromRequirement(requirement);
  const target = targets.find((item) => item.key === input.targetKey);
  const needsResult =
    input.targetKey !== "chronology" &&
    !question.followUp &&
    !answerHasResult(answer);
  if (needsResult) {
    await addTurn({
      organizationId: input.organizationId,
      sessionId: session.id,
      speaker: "CONSULTANT",
      body: resultFollowUpQuestion(target?.text ?? "this"),
      targetKey: input.targetKey,
      followUp: true,
    });
    return;
  }
  const competencies = targets
    .filter((item) => item.kind === "COMPETENCY")
    .map((item) => ({ id: item.key, text: item.text }));
  const targetCompetency =
    target?.kind === "COMPETENCY" ? { id: target.key, text: target.text } : null;
  const deterministic = proposalsFromAnswer({
    answer,
    turnId: seekerTurn.id,
    competencies,
    targetCompetency,
    allowWithoutResult: question.followUp || input.targetKey === "chronology",
  });
  const extracted = await extractWithModel({
    answer,
    requirement: target?.text ?? null,
    competencies,
  });
  const proposals = chooseProposals({
    answer,
    turnId: seekerTurn.id,
    deterministic,
    extracted: extracted.ok ? extracted.data : null,
    competencies,
  });
  if (!extracted.ok && extracted.message.includes("could not extract")) {
    await prisma.consultationSession.update({
      where: { id: session.id },
      data: { coachNote: extracted.message },
    });
  }
  for (const proposal of proposals) {
    await prisma.consultationProposal.create({
      data: {
        organizationId: input.organizationId,
        sessionId: session.id,
        turnId: seekerTurn.id,
        kind: proposal.kind,
        text: proposal.text,
        storyJson: proposal.story ?? undefined,
        competencyLinks: proposal.story?.competencyLinks ?? undefined,
        profileItemId: proposal.profileItemId,
      },
    });
  }
  const refreshed = await loadSessionTurns(session.id);
  const open = refreshed.some((turn) => {
    if (turn.speaker !== "CONSULTANT" || !turn.targetKey) return false;
    return unanswered(refreshed, turn.targetKey) != null;
  });
  if (open) return;
  const stored = await prisma.consultationAssessment.findMany({
    where: { sessionId: session.id },
  });
  const assessments: EvidenceAssessment[] = stored.map((row) => ({
    key: row.targetKey,
    kind: row.kind as EvidenceAssessment["kind"],
    text: row.text,
    strength: row.strength,
    supportingFactIds: parseStringArray(row.supportingFactIds),
    strategy: row.strategy,
  }));
  const { askedKeys, skippedKeys } = askedAndSkipped(refreshed);
  if (gapsAreCovered(assessments, skippedKeys)) {
    await prisma.consultationSession.update({
      where: { id: session.id },
      data: { status: "DONE" },
    });
    return;
  }
  const roles = await hiringTeam(input.organizationId, input.campaignId);
  const next = await planAndStoreRound({
    organizationId: input.organizationId,
    sessionId: session.id,
    assessments,
    askedKeys,
    skippedKeys,
    profile,
    requirement,
    roles,
  });
  if (next.length === 0) {
    await prisma.consultationSession.update({
      where: { id: session.id },
      data: { status: "DONE" },
    });
  }
}

function chooseProposals(input: {
  answer: string;
  turnId: string;
  deterministic: ProposalDraft[];
  extracted: {
    facts: Array<{ text: string }>;
    story: {
      situation: string | null;
      task: string | null;
      action: string | null;
      result: string | null;
    } | null;
  } | null;
  competencies: Array<{ id: string; text: string }>;
}): ProposalDraft[] {
  if (!input.extracted) return input.deterministic;
  const facts = input.extracted.facts.filter((fact) =>
    groundedInAnswer(fact.text, input.answer),
  );
  const story = input.extracted.story;
  const storyGrounded = Boolean(
    story?.situation &&
      story.task &&
      story.action &&
      story.result &&
      groundedInAnswer(story.situation, input.answer) &&
      groundedInAnswer(story.task, input.answer) &&
      groundedInAnswer(story.action, input.answer) &&
      groundedInAnswer(story.result, input.answer),
  );
  if (facts.length === 0 && !storyGrounded) return input.deterministic;
  const proposals: ProposalDraft[] = facts.map((fact, index) => ({
    kind: "FACT" as const,
    text: fact.text.trim(),
    story: null,
    profileItemId: `consult_${input.turnId}_fact_${index}`,
  }));
  if (storyGrounded && story?.result && story.situation && story.task && story.action) {
    const answerTokens = input.answer.toLowerCase();
    proposals.push({
      kind: "STORY",
      text: story.result,
      story: {
        situation: story.situation,
        task: story.task,
        action: story.action,
        result: story.result,
        competencyLinks: input.competencies.filter((item) =>
          answerTokens.includes(item.text.toLowerCase().split(" ")[0] ?? "\u0000"),
        ),
      },
      profileItemId: `consult_${input.turnId}_story`,
    });
  }
  return proposals.length > 0 ? proposals : input.deterministic;
}

export async function skipConsultationQuestion(input: {
  organizationId: string;
  campaignId: string;
  targetKey: string;
}): Promise<void> {
  const session = await prisma.consultationSession.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!session || session.status !== "IN_PROGRESS") {
    throw new TenantError("The consultation is not waiting for an answer.");
  }
  const turns = await loadSessionTurns(session.id);
  if (!unanswered(turns, input.targetKey)) {
    throw new TenantError("That question is not open.");
  }
  await addTurn({
    organizationId: input.organizationId,
    sessionId: session.id,
    speaker: "SEEKER",
    body: "",
    targetKey: input.targetKey,
    skipped: true,
    seekerAuthored: true,
  });
  const refreshed = await loadSessionTurns(session.id);
  const stillOpen = refreshed.some(
    (turn) =>
      turn.speaker === "CONSULTANT" &&
      turn.targetKey &&
      unanswered(refreshed, turn.targetKey),
  );
  if (stillOpen) return;
  const { requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const stored = await prisma.consultationAssessment.findMany({
    where: { sessionId: session.id },
  });
  const assessments: EvidenceAssessment[] = stored.map((row) => ({
    key: row.targetKey,
    kind: row.kind as EvidenceAssessment["kind"],
    text: row.text,
    strength: row.strength,
    supportingFactIds: parseStringArray(row.supportingFactIds),
    strategy: row.strategy,
  }));
  const { askedKeys, skippedKeys } = askedAndSkipped(refreshed);
  if (gapsAreCovered(assessments, skippedKeys)) {
    await prisma.consultationSession.update({
      where: { id: session.id },
      data: { status: "DONE" },
    });
    return;
  }
  const roles = await hiringTeam(input.organizationId, input.campaignId);
  const next = await planAndStoreRound({
    organizationId: input.organizationId,
    sessionId: session.id,
    assessments,
    askedKeys,
    skippedKeys,
    profile,
    requirement,
    roles,
  });
  if (next.length === 0) {
    await prisma.consultationSession.update({
      where: { id: session.id },
      data: { status: "DONE" },
    });
  }
}

export async function confirmConsultationProposal(input: {
  organizationId: string;
  proposalId: string;
  text: string;
  situation: string | null;
  task: string | null;
  action: string | null;
  result: string | null;
}): Promise<void> {
  const proposal = await prisma.consultationProposal.findFirst({
    where: { id: input.proposalId, organizationId: input.organizationId },
    include: { session: true, turn: true },
  });
  if (!proposal) throw new TenantError("That proposed item was not found.");
  if (proposal.status !== "PENDING") {
    throw new TenantError("That item has already been confirmed or dismissed.");
  }
  const text = input.text.trim();
  if (!text) throw new TenantError("Confirmed text cannot be empty.");
  const { product, profile, requirement } = await requireApplication(
    input.organizationId,
    proposal.session.campaignId,
  );
  if (proposal.kind === "FACT") {
    const next = appendConfirmedFact(profile, {
      id: proposal.profileItemId ?? `consult_${proposal.turnId}_fact`,
      text,
      turnId: proposal.turnId,
    });
    await prisma.product.update({
      where: { id: product.id },
      data: { profileJson: next },
    });
    const targets = targetsFromRequirement(requirement);
    await saveAssessments(
      input.organizationId,
      proposal.sessionId,
      reassessProfile({ profile: next, targets }),
    );
  } else {
    const situation = input.situation?.trim() || "";
    const task = input.task?.trim() || "";
    const action = input.action?.trim() || "";
    const result = input.result?.trim() || "";
    if (!situation || !task || !action || !result) {
      throw new TenantError("A story needs a situation, task, action, and result.");
    }
    const links = Array.isArray(proposal.competencyLinks)
      ? proposal.competencyLinks
      : [];
    await prisma.profileStory.create({
      data: {
        organizationId: input.organizationId,
        productId: product.id,
        situation,
        task,
        action,
        result,
        competencyLinks: links,
        consultationTurnId: proposal.turnId,
        seekerAuthored: true,
      },
    });
  }
  await prisma.consultationProposal.update({
    where: { id: proposal.id },
    data: { status: "CONFIRMED", text },
  });
  const assessments = await prisma.consultationAssessment.findMany({
    where: { sessionId: proposal.sessionId },
  });
  const skipped = await prisma.consultationTurn.findMany({
    where: { sessionId: proposal.sessionId, speaker: "SEEKER", skipped: true },
    select: { targetKey: true },
  });
  const covered = gapsAreCovered(
    assessments.map((row) => ({
      key: row.targetKey,
      kind: row.kind as EvidenceAssessment["kind"],
      text: row.text,
      strength: row.strength,
      supportingFactIds: parseStringArray(row.supportingFactIds),
      strategy: row.strategy,
    })),
    new Set(skipped.map((turn) => turn.targetKey).filter((key): key is string => Boolean(key))),
  );
  if (covered && proposal.session.status === "IN_PROGRESS") {
    await prisma.consultationSession.update({
      where: { id: proposal.sessionId },
      data: { status: "DONE" },
    });
  }
}

export async function dismissConsultationProposal(input: {
  organizationId: string;
  proposalId: string;
}): Promise<void> {
  const proposal = await prisma.consultationProposal.findFirst({
    where: { id: input.proposalId, organizationId: input.organizationId, status: "PENDING" },
  });
  if (!proposal) throw new TenantError("That proposed item was not found.");
  await prisma.consultationProposal.update({
    where: { id: proposal.id },
    data: { status: "DISMISSED" },
  });
}

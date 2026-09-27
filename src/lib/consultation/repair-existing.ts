import {
  isCompanyMissionOrTagline,
  isInterviewerPrepTarget,
  type EvidenceKind,
} from "@/lib/consultation/assess";
import { questionNearDuplicate } from "@/lib/consultation/questions";
import { prisma } from "@/lib/prisma-client";

export function isTemplatedUnseenQuestion(text: string): boolean {
  return /harper does not see/i.test(text);
}

export function looksLikeCareerWalkthrough(text: string): boolean {
  return /walk me through your (?:career|background|work history)/i.test(text);
}

const LEGACY_CANNED_HARPER_TEXT = [
  "Which roles did that come from?",
  "What in your background speaks to this?",
  "Why do you want to work at this company? Say what specifically draws you to it for this role.",
  "Tell me what happened, what you did, and what the result was.",
  "I can work with what you shared. A bit more detail will make the story stronger.",
  "Tell me what the situation was.",
  "Tell me what you were asked to do.",
  "Tell me what you did.",
  "Tell me what the result was.",
  "Tell me the number or outcome.",
] as const;

export function looksLikeCannedHarperText(text: string): boolean {
  const body = text.trim();
  if (!body) return false;
  return LEGACY_CANNED_HARPER_TEXT.some(
    (fragment) =>
      body === fragment ||
      body.endsWith(` ${fragment}`) ||
      body.includes(fragment),
  );
}

export function cannedWordingRepairedAt(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const marked = (value as { cannedWordingRepairedAt?: unknown })
    .cannedWordingRepairedAt;
  return typeof marked === "string" && marked.trim() ? marked.trim() : null;
}

export async function repairExistingConsultationSession(input: {
  organizationId: string;
  campaignId: string;
}): Promise<{ repaired: boolean }> {
  const session = await prisma.consultationSession.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    },
    include: {
      turns: { orderBy: { sequence: "asc" } },
      assessments: true,
      statements: true,
    },
  });
  if (!session) return { repaired: false };

  let repaired = false;
  const templated = session.turns.filter(
    (turn) =>
      turn.speaker === "CONSULTANT" && isTemplatedUnseenQuestion(turn.body),
  );
  if (templated.length > 0) {
    const ids = templated.map((turn) => turn.id);
    await prisma.consultationTurn.deleteMany({
      where: { id: { in: ids }, sessionId: session.id },
    });
    repaired = true;
  }

  const remainingQuestions = session.turns.filter(
    (turn) =>
      turn.speaker === "CONSULTANT" &&
      !turn.followUp &&
      turn.intent !== "CLOSING" &&
      !templated.some((row) => row.id === turn.id),
  );
  const dropIds = new Set<string>();
  for (let index = 0; index < remainingQuestions.length; index += 1) {
    const current = remainingQuestions[index]!;
    if (dropIds.has(current.id)) continue;
    const group = remainingQuestions.filter(
      (other) =>
        !dropIds.has(other.id) &&
        (other.id === current.id ||
          (current.targetKey === "chronology" &&
            other.targetKey === "chronology") ||
          (looksLikeCareerWalkthrough(current.body) &&
            looksLikeCareerWalkthrough(other.body)) ||
          (Boolean(current.targetKey) &&
            current.targetKey === other.targetKey &&
            questionNearDuplicate(current.body, other.body))),
    );
    if (group.length < 2) continue;
    const answered = group.find((question) =>
      session.turns.some(
        (reply) =>
          reply.speaker === "SEEKER" &&
          !reply.skipped &&
          reply.body.trim() &&
          (reply.targetKey === question.targetKey ||
            (reply.analysisJson &&
              typeof reply.analysisJson === "object" &&
              !Array.isArray(reply.analysisJson) &&
              (reply.analysisJson as { replyToTurnId?: string }).replyToTurnId ===
                question.id)),
      ),
    );
    const keep =
      answered ??
      [...group].sort(
        (left, right) => right.sequence - left.sequence,
      )[0]!;
    for (const extra of group) {
      if (extra.id !== keep.id) dropIds.add(extra.id);
    }
  }
  if (dropIds.size > 0) {
    await prisma.consultationTurn.deleteMany({
      where: { id: { in: [...dropIds] }, sessionId: session.id },
    });
    repaired = true;
  }

  const badAssessments = session.assessments.filter(
    (row) =>
      isCompanyMissionOrTagline({
        key: row.targetKey,
        kind: row.kind as EvidenceKind,
        text: row.text,
      }) ||
      isInterviewerPrepTarget({ key: row.targetKey, text: row.text }),
  );
  if (badAssessments.length > 0) {
    await prisma.consultationAssessment.deleteMany({
      where: {
        sessionId: session.id,
        id: { in: badAssessments.map((row) => row.id) },
      },
    });
    repaired = true;
  }

  const remaining = await prisma.consultationTurn.findMany({
    where: { sessionId: session.id },
    orderBy: { sequence: "asc" },
  });
  const openConsultant = remaining.filter(
    (turn) =>
      turn.speaker === "CONSULTANT" &&
      turn.intent !== "CLOSING" &&
      !turn.followUp,
  );
  const unanswered = openConsultant.some(
    (question) =>
      !remaining.some(
        (reply) =>
          reply.speaker === "SEEKER" &&
          !reply.skipped &&
          reply.body.trim() &&
          (reply.targetKey === question.targetKey ||
            (reply.analysisJson &&
              typeof reply.analysisJson === "object" &&
              !Array.isArray(reply.analysisJson) &&
              (reply.analysisJson as { replyToTurnId?: string }).replyToTurnId ===
                question.id)),
      ),
  );
  const openAssessments = await prisma.consultationAssessment.count({
    where: {
      sessionId: session.id,
      strength: { not: "STRONG" },
      NOT: {
        OR: [
          { targetKey: { startsWith: "mission:" } },
          { targetKey: { startsWith: "person-prep:" } },
          { targetKey: { startsWith: "interview-note-focus" } },
        ],
      },
    },
  });
  if (
    (session.status === "SKIPPED" || session.status === "DONE") &&
    (unanswered || openAssessments > 0)
  ) {
    await prisma.consultationSession.update({
      where: { id: session.id },
      data: { status: "IN_PROGRESS" },
    });
    repaired = true;
  }

  return { repaired };
}

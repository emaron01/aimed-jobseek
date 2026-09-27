import {
  isCompanyMissionOrTagline,
  isInterviewerPrepTarget,
  type EvidenceKind,
} from "@/lib/consultation/assess";
import { WHY_THIS_COMPANY_TARGET_KEY } from "@/lib/consultation/contract";
import { questionNearDuplicate } from "@/lib/consultation/questions";
import {
  looksLikeCompanyMotivation,
  seekerWrittenReply,
} from "@/lib/consultation/reply-voice";
import { prisma } from "@/lib/prisma-client";

export function isTemplatedUnseenQuestion(text: string): boolean {
  return /harper does not see/i.test(text);
}

export function looksLikeCareerWalkthrough(text: string): boolean {
  return /walk me through your (?:career|background|work history)/i.test(text);
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

  const seekerTurns = session.turns.filter(
    (turn) => turn.speaker === "SEEKER" && !turn.skipped,
  );

  const whyQuestions = session.turns.filter(
    (turn) =>
      turn.speaker === "CONSULTANT" &&
      turn.targetKey === WHY_THIS_COMPANY_TARGET_KEY &&
      !dropIds.has(turn.id),
  );
  const whyReplies = seekerTurns.filter(
    (turn) =>
      turn.targetKey === WHY_THIS_COMPANY_TARGET_KEY ||
      whyQuestions.some((question) => {
        const analysis = turn.analysisJson;
        return (
          analysis &&
          typeof analysis === "object" &&
          !Array.isArray(analysis) &&
          (analysis as { replyToTurnId?: string }).replyToTurnId === question.id
        );
      }),
  );
  const motivation = [...whyReplies]
    .reverse()
    .find((turn) => looksLikeCompanyMotivation(turn.body));
  if (motivation) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: input.campaignId, organizationId: input.organizationId },
      select: { whyThisCompany: true },
    });
    const motivationText = seekerWrittenReply(motivation.body);
    if (
      motivationText &&
      campaign &&
      campaign.whyThisCompany?.trim() !== motivationText
    ) {
      await prisma.campaign.update({
        where: { id: input.campaignId },
        data: { whyThisCompany: motivationText },
      });
      repaired = true;
    }
    const misplaced = session.statements.filter((statement) =>
      whyReplies.some(
        (reply) =>
          reply.id === statement.turnId && reply.id !== motivation.id,
      ),
    );
    for (const statement of misplaced) {
      const existing = session.statements.find(
        (row) => row.turnId === motivation.id && row.kind === statement.kind,
      );
      if (existing) {
        await prisma.consultationStatement.delete({ where: { id: statement.id } });
      } else {
        await prisma.consultationStatement.update({
          where: { id: statement.id },
          data: { turnId: motivation.id },
        });
      }
      repaired = true;
    }
  }

  for (const turn of seekerTurns) {
    const cleaned = seekerWrittenReply(turn.body);
    if (cleaned !== turn.body.trim()) {
      if (!cleaned) {
        await prisma.consultationTurn.delete({ where: { id: turn.id } });
      } else {
        await prisma.consultationTurn.update({
          where: { id: turn.id },
          data: { body: cleaned },
        });
      }
      repaired = true;
    }
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

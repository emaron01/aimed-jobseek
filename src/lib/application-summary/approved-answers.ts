/**
 * Approved interview answers the person-guide writer may cite by id.
 * The guide copies content exactly. It does not update these rows.
 */

import { prisma } from "@/lib/prisma-client";
import { replyToTurnIdFromAnalysis } from "@/lib/consultation/qa-view";

export type ApprovedInterviewAnswer = {
  id: string;
  question: string;
  content: string;
};

export async function loadApprovedInterviewAnswers(input: {
  organizationId: string;
  campaignId: string;
}): Promise<ApprovedInterviewAnswer[]> {
  const session = await prisma.consultationSession.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    },
    select: {
      statements: {
        where: { kind: "INTERVIEW_ANSWER", status: "APPROVED" },
        orderBy: { approvedAt: "asc" },
        select: { id: true, content: true, turnId: true },
      },
      turns: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          speaker: true,
          body: true,
          sequence: true,
          analysisJson: true,
        },
      },
    },
  });
  if (!session) return [];
  const turns = new Map(session.turns.map((turn) => [turn.id, turn]));
  const answers: ApprovedInterviewAnswer[] = [];
  for (const statement of session.statements) {
    const content = statement.content;
    if (!content.trim()) continue;
    const turn = turns.get(statement.turnId);
    let question = "";
    if (turn?.speaker === "CONSULTANT") {
      question = turn.body.trim();
    } else if (turn) {
      const pinnedId = replyToTurnIdFromAnalysis(turn.analysisJson);
      const pinned = pinnedId ? turns.get(pinnedId) : undefined;
      if (pinned?.speaker === "CONSULTANT" && pinned.body.trim()) {
        question = pinned.body.trim();
      } else {
        const earlier = session.turns.filter(
          (candidate) =>
            candidate.speaker === "CONSULTANT" &&
            candidate.sequence < turn.sequence &&
            candidate.body.trim(),
        );
        question = earlier.at(-1)?.body.trim() ?? "";
      }
    }
    answers.push({ id: statement.id, question, content });
  }
  return answers;
}

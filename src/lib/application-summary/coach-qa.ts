import { prisma } from "@/lib/prisma-client";
import {
  coachItemIdFromCheatSheetTarget,
  contactIdFromCheatSheetTarget,
} from "@/lib/consultation/harper-layout";
import {
  buildConsultationQaView,
  type ConsultationQaItem,
} from "@/lib/consultation/qa-view";

/**
 * Read-only: map cheat-sheet coach item ids to existing Harper Q&A turns.
 * Used so the Cheat Sheet can link Edit → `#harper-q:{questionTurnId}`.
 * Does not enqueue jobs or make paid calls.
 */
export async function loadCheatSheetCoachQaByContact(input: {
  organizationId: string;
  campaignId: string;
}): Promise<Map<string, ConsultationQaItem[]>> {
  const session = await prisma.consultationSession.findFirst({
    where: {
      campaignId: input.campaignId,
      organizationId: input.organizationId,
    },
    select: {
      turns: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          speaker: true,
          body: true,
          targetKey: true,
          followUp: true,
          sequence: true,
          analysisJson: true,
          intent: true,
        },
      },
      statements: {
        orderBy: [{ turnId: "asc" }, { kind: "asc" }],
        select: {
          id: true,
          turnId: true,
          kind: true,
          status: true,
          content: true,
          strengtheningNote: true,
          createdAt: true,
        },
      },
    },
  });
  const byContact = new Map<string, ConsultationQaItem[]>();
  if (!session) return byContact;

  const view = buildConsultationQaView({
    turns: session.turns.map((turn) => ({
      id: turn.id,
      speaker: turn.speaker as "CONSULTANT" | "SEEKER",
      body: turn.body,
      targetKey: turn.targetKey,
      followUp: turn.followUp,
      sequence: turn.sequence,
      analysisJson: turn.analysisJson,
      intent: turn.intent,
    })),
    statements: session.statements.map((statement) => ({
      id: statement.id,
      turnId: statement.turnId,
      kind: statement.kind as "INTERVIEW_ANSWER" | "RESUME_BULLET",
      status: statement.status,
      content: statement.content,
      strengtheningNote: statement.strengtheningNote,
      createdAt: statement.createdAt,
    })),
  });

  for (const item of view.questions) {
    if (!coachItemIdFromCheatSheetTarget(item.targetKey)) continue;
    const contactId = contactIdFromCheatSheetTarget(item.targetKey);
    if (!contactId) continue;
    const list = byContact.get(contactId) ?? [];
    list.push(item);
    byContact.set(contactId, list);
  }
  return byContact;
}

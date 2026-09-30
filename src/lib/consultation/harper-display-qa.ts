import { prisma } from "@/lib/prisma-client";
import {
  orderedAnsweredHarperQuestions,
  profilePrimaryQuestionTurnIdsFromInterviewerSection,
} from "@/lib/consultation/additional-prep-qa";
import {
  buildHarperQaLayout,
  generalQuestionsForCheatSheet,
  partitionGeneralQuestionsForStanding,
  type HarperInterviewerOrderItem,
} from "@/lib/consultation/harper-layout";
import {
  buildConsultationQaView,
  type ConsultationQaItem,
} from "@/lib/consultation/qa-view";
import { isStandingRequirement } from "@/lib/consultation/assess";
import { interviewConfig } from "@/lib/product-config/interview";

/**
 * Read-only: answered Harper questions in the same display order as the Harper page.
 * Does not enqueue jobs or make paid calls.
 */
export async function loadOrderedAnsweredHarperQuestions(input: {
  organizationId: string;
  campaignId: string;
}): Promise<{
  answeredInHarperOrder: ConsultationQaItem[];
  /** Primary interviewer-section questions by contact (for exclude-on-profile). */
  interviewerQuestionsByContactId: Map<string, ConsultationQaItem[]>;
  /** Every general Harper item, once, for the Cheat Sheet General Questions section. */
  generalQuestions: ConsultationQaItem[];
}> {
  const [session, stages] = await Promise.all([
    prisma.consultationSession.findFirst({
      where: {
        campaignId: input.campaignId,
        organizationId: input.organizationId,
      },
      select: {
        assessments: {
          orderBy: { targetKey: "asc" },
          select: {
            targetKey: true,
            kind: true,
            text: true,
          },
        },
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
            questionContextJson: true,
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
    }),
    prisma.interviewStage.findMany({
      where: {
        campaignId: input.campaignId,
        organizationId: input.organizationId,
      },
      orderBy: [{ scheduledAt: "asc" }, { sortOrder: "asc" }],
      select: {
        scheduledAt: true,
        interviewers: {
          select: {
            contact: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                title: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const empty = {
    answeredInHarperOrder: [] as ConsultationQaItem[],
    interviewerQuestionsByContactId: new Map<string, ConsultationQaItem[]>(),
    generalQuestions: [] as ConsultationQaItem[],
  };
  if (!session) return empty;

  const qaView = buildConsultationQaView({
    turns: session.turns.map((turn) => ({
      id: turn.id,
      speaker: turn.speaker as "CONSULTANT" | "SEEKER",
      body: turn.body,
      targetKey: turn.targetKey,
      followUp: turn.followUp,
      sequence: turn.sequence,
      analysisJson: turn.analysisJson,
      intent: turn.intent,
      questionContextJson: turn.questionContextJson,
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

  const interviewerOrder = new Map<string, HarperInterviewerOrderItem>();
  for (const stage of stages) {
    const sortAt = stage.scheduledAt.getTime();
    for (const row of stage.interviewers) {
      const contactId = row.contact.id;
      const heading =
        [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" ").trim() ||
        row.contact.title?.trim() ||
        interviewConfig.labels.interviewer;
      const existing = interviewerOrder.get(contactId);
      if (!existing || existing.sortAt == null || sortAt < existing.sortAt) {
        interviewerOrder.set(contactId, { contactId, heading, sortAt });
      }
    }
  }

  const qaLayout = buildHarperQaLayout({
    questions: qaView.questions,
    interviewers: [...interviewerOrder.values()],
  });

  const standingRequirementKeys = session.assessments
    .filter((item) =>
      isStandingRequirement({
        key: item.targetKey,
        kind: item.kind as
          | "REQUIRED"
          | "OUTCOME"
          | "COMPETENCY"
          | "MISSION"
          | "PREFERRED",
        text: item.text,
      }),
    )
    .map((item) => item.targetKey);

  const requirementLabels = new Map(
    session.assessments.map((item) => [item.targetKey, item.text]),
  );
  const standingInline = partitionGeneralQuestionsForStanding({
    general: qaLayout.general,
    requirementTargetKeys: standingRequirementKeys,
    requirementLabels,
  });

  const standingRequirementRows: Array<{
    targetKey: string;
    questions: ConsultationQaItem[];
  }> = [
    ...standingRequirementKeys.map((targetKey) => ({
      targetKey,
      questions: standingInline.byRequirementKey.get(targetKey) ?? [],
    })),
    ...standingInline.orphanedRequirementTopics.map((topic) => ({
      targetKey: topic.targetKey,
      questions: topic.questions,
    })),
  ];

  const answeredInHarperOrder = orderedAnsweredHarperQuestions({
    dedicatedTopics: standingInline.dedicatedTopics,
    standingRequirementRows,
    interviewers: qaLayout.interviewers,
  });

  const interviewerQuestionsByContactId = new Map<string, ConsultationQaItem[]>();
  for (const section of qaLayout.interviewers) {
    interviewerQuestionsByContactId.set(section.contactId, section.questions);
  }

  return {
    answeredInHarperOrder,
    interviewerQuestionsByContactId,
    generalQuestions: generalQuestionsForCheatSheet(standingInline),
  };
}

export function primaryTurnIdsForContact(
  interviewerQuestionsByContactId: Map<string, ConsultationQaItem[]>,
  contactId: string,
): string[] {
  const section = interviewerQuestionsByContactId.get(contactId);
  if (!section) return [];
  return profilePrimaryQuestionTurnIdsFromInterviewerSection({
    contactId,
    heading: "",
    questions: section,
  });
}

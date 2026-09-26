import { z } from "zod";

export const CONSULTATION_PROMPT_VERSION = "17";

export const WHY_THIS_COMPANY_TARGET_KEY = "why-this-company";
export const PERSON_PREP_TARGET_PREFIX = "person-prep:";

const strengthSchema = z.enum(["STRONG", "PARTIAL", "NONE"]);
const strategyModeSchema = z.enum([
  "PROVE_WITH_STORY",
  "REFRAME_ADJACENT",
  "ACKNOWLEDGE",
]);

export const consultationBriefingSchema = z.object({
  overall: z.string(),
  strongestAngles: z.array(z.string()).min(2).max(3),
  importantGaps: z.array(z.string()).min(1).max(10),
  storyPlan: z.array(z.string()).max(5),
});

export const consultationPlanSchema = z.object({
  commentary: z.string(),
  briefing: consultationBriefingSchema,
  closingNote: z.string().nullable(),
  assessments: z.array(
    z.object({
      targetKey: z.string(),
      strength: strengthSchema,
      supportingFactIds: z.array(z.string()),
      relevantRoleIds: z.array(z.string()),
      explanation: z.string(),
      strategyMode: strategyModeSchema,
      strategy: z.string(),
    }),
  ),
  questions: z.array(
    z.object({
      targetKey: z.string(),
      text: z.string(),
      requirementInterpretation: z.string().nullable(),
      hiringTeamRoleId: z.string(),
      whoCaresNote: z.string(),
    }),
  ),
});

const extractStorySchema = z
  .object({
    situation: z.string().nullable(),
    task: z.string().nullable(),
    action: z.string().nullable(),
    result: z.string().nullable(),
  })
  .nullable();

export const consultationExtractSchema = z.object({
  replyType: z.enum(["answer", "feedback"]),
  revisedQuestion: z.string().nullable(),
  facts: z.array(
    z.object({
      text: z.string(),
    }),
  ),
  story: extractStorySchema,
  demonstratedTargets: z.array(
    z.object({
      targetKey: z.string(),
      explanation: z.string(),
    }),
  ),
  missingStarElements: z.array(
    z.enum(["SITUATION", "TASK", "ACTION", "RESULT", "METRIC"]),
  ),
  coaching: z.string().nullable(),
  followUpQuestion: z.string().nullable(),
  gapDecision: z.enum(["evidence", "no_evidence", "incomplete"]).nullable(),
});

export const consultationPolishSchema = z.object({
  interviewAnswer: z.string(),
  resumeBullet: z.string().nullable(),
  strengtheningNote: z.string().nullable(),
});

export type ConsultationPlanResult = z.infer<typeof consultationPlanSchema>;
export type ConsultationExtractResult = z.infer<typeof consultationExtractSchema>;
export type ConsultationExtractFeedback = ConsultationExtractResult & {
  replyType: "feedback";
  revisedQuestion: string;
};
export type ConsultationExtractAnswer = ConsultationExtractResult & {
  replyType: "answer";
  gapDecision: "evidence" | "no_evidence" | "incomplete";
};
export type ConsultationPolishResult = z.infer<typeof consultationPolishSchema>;

export function isConsultationExtractAnswer(
  value: ConsultationExtractResult,
): value is ConsultationExtractAnswer {
  return value.replyType === "answer" && value.gapDecision != null;
}

export function isConsultationExtractFeedback(
  value: ConsultationExtractResult,
): value is ConsultationExtractFeedback {
  return value.replyType === "feedback" && Boolean(value.revisedQuestion?.trim());
}

export type AskedConsultationQuestion = {
  text: string;
  answered: boolean;
  targetKey: string | null;
  followUp: boolean;
};

export type SeekerStatedFactPayload = {
  id: string;
  kind: "FACT";
  text: string;
  source: "added_background" | "interview_learning";
};

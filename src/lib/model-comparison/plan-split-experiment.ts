/**
 * Experimental planning split used only by the model comparison script.
 * These instructions are not Harper's production coach. They need product-owner
 * approval before any production use. planAndStoreRound does not import this file.
 */
import { z } from "zod";
import type { AiMessage } from "@/lib/ai/types";
import {
  interviewTypeTagSchema,
} from "@/lib/consultation/contract";
import { consultationConfig } from "@/lib/product-config/consultation";

export const PLANNING_DECISION_SCHEMA_NAME =
  "consultation_plan_decision_experiment";
export const PLANNING_WRITING_SCHEMA_NAME =
  "consultation_plan_writing_experiment";

const strengthSchema = z.enum(["STRONG", "PARTIAL", "NONE"]);
const strategyModeSchema = z.enum([
  "PROVE_WITH_STORY",
  "REFRAME_ADJACENT",
  "ACKNOWLEDGE",
]);

/** Judgment only. No standing summary, commentary, or other prose. */
export const planningDecisionSchema = z.object({
  assessments: z.array(
    z.object({
      targetKey: z.string(),
      strength: strengthSchema,
      supportingFactIds: z.array(z.string()),
      relevantRoleIds: z.array(z.string()),
      strategyMode: strategyModeSchema,
    }),
  ),
  questions: z.array(
    z.object({
      targetKey: z.string(),
      text: z.string(),
      hiringTeamRoleId: z.string(),
      interviewTypeTag: interviewTypeTagSchema,
    }),
  ),
});

/** Prose only. Keys refer to the decision. This schema cannot set strength or question text. */
export const planningWritingSchema = z.object({
  overall: z.string(),
  strongestAngles: z.array(z.string()),
  importantGaps: z.array(z.string()),
  commentary: z.string(),
  closingNote: z.string().nullable(),
  assessments: z.array(
    z.object({
      targetKey: z.string(),
      explanation: z.string(),
      strategy: z.string(),
    }),
  ),
  questions: z.array(
    z.object({
      targetKey: z.string(),
      whoCaresNote: z.string(),
      requirementInterpretation: z.string().nullable(),
    }),
  ),
});

export type PlanningDecision = z.infer<typeof planningDecisionSchema>;
export type PlanningWriting = z.infer<typeof planningWritingSchema>;

const questionCap = consultationConfig.applicationQuestionLimit;

export const EXPERIMENTAL_PLANNING_DECISION_INSTRUCTIONS = `EXPERIMENTAL. Not production. For this comparison script only. Do not treat this as Harper's live coach.

You decide. You do not write the standing summary, angles, gap essays, commentary, closing note, explanation, strategy prose, who-cares note, or requirement interpretation.

Rate every target STRONG, PARTIAL, or NONE. Put FACT item ids only in supportingFactIds. Put FACT experience role ids only in relevantRoleIds. Set strategyMode to PROVE_WITH_STORY, REFRAME_ADJACENT, or ACKNOWLEDGE. Do not invent employers, titles, metrics, or skills. Ids belong only in id fields.

Ask one question per remaining gap, most important first. Across this application, including askedQuestions, never more than ${questionCap} questions. Never repeat or closely rephrase askedQuestions, including questions marked ignored. Question text is specific to this person's roles and this job. Do not paste requirement, responsibility, or posting text into a question. Mission statements, company taglines, and recruiting pitches are not gaps. Do not ask about a target you rated STRONG. The career walk-through comes only from recentRoles, at most once, and never for a role that ended more than 10 years ago. Never ask the person to walk through their whole career or start from their first job.

Each question has targetKey, text, hiringTeamRoleId (one supplied Hiring Team role id), and interviewTypeTag (screening, chronological_walk_through, focused_competency, or reference_check_prep). Use chronological_walk_through only for the career walk-through.

Match careerStage: for new_to_workforce or college_graduate, ask about school, internships, projects, part-time work, and activities when the profile has them; for early_career through late_career, ask about roles and results at the level of this job.

When interviewerPrep is present, this round is prep for that person. Ask only what that person will probe. Do not assess the interviewer as a skill. Do not add a question whose text is that you are preparing them for this interviewer.

When focusTargetKey is present, the first question targets it.

Return JSON matching the schema only.`;

export const EXPERIMENTAL_PLANNING_WRITING_INSTRUCTIONS = `EXPERIMENTAL. Not production. For this comparison script only. Do not treat this as Harper's live coach.

The decision is given in the decision object. Do not add, drop, or reword questions. Do not change strengths, fact ids, role ids, strategy mode, Hiring Team role id, or interview-type tag. Write prose for the decision's targets and questions only.

Write overall as an honest two-to-four sentence standing for this job, spoken to the person as "you". Write two or three strongestAngles, concrete advantages from the profile. Write importantGaps as observations of what is missing, never as instructions. If the decision has no remaining gaps, write one sentence that says there are no remaining experience gaps for this job.

For every assessment in the decision, write explanation and a short strategy that follows that assessment's strategyMode and uses only experience the decision cited. For every question, write whoCaresNote from the supplied persona, naming that role and what that person needs to hear. Write requirementInterpretation when the question is about a vague requirement; otherwise null.

Write commentary for this round, spoken as "you". Write closingNote only when the decision has no questions; otherwise null. When interviewerPrep is present, commentary is the opening the seeker sees: what this person will likely probe, which of their stories fit, and the questions for weak spots. Do not call it a question plan.

Never invent employers, titles, metrics, or skills. Never put an id in prose. Speak to the person as "you".

Return JSON matching the schema only.`;

export function planningDecisionMessages(
  coachMessages: AiMessage[],
): AiMessage[] {
  return [
    { role: "system", content: EXPERIMENTAL_PLANNING_DECISION_INSTRUCTIONS },
    ...coachMessages.filter((message) => message.role !== "system"),
  ];
}

export function planningWritingMessages(
  coachMessages: AiMessage[],
  decision: PlanningDecision,
): AiMessage[] {
  return [
    { role: "system", content: EXPERIMENTAL_PLANNING_WRITING_INSTRUCTIONS },
    ...coachMessages.filter((message) => message.role !== "system"),
    {
      role: "user",
      content: JSON.stringify({ decision }),
    },
  ];
}

export function formatExperimentalSplit(input: {
  decision: PlanningDecision;
  writing: PlanningWriting | null;
  writingError: string | null;
}): string {
  const questions = input.decision.questions
    .map((question, index) => {
      const prose = input.writing?.questions.find(
        (item) => item.targetKey === question.targetKey,
      );
      return [
        `${index + 1}. ${question.text}`,
        `Target: ${question.targetKey}`,
        `Hiring Team role: ${question.hiringTeamRoleId}`,
        `Interview type: ${question.interviewTypeTag}`,
        `Who cares: ${prose?.whoCaresNote ?? ""}`,
        `Requirement interpretation: ${prose?.requirementInterpretation ?? ""}`,
      ].join("\n");
    })
    .join("\n\n");
  const assessments = input.decision.assessments
    .map((assessment) => {
      const prose = input.writing?.assessments.find(
        (item) => item.targetKey === assessment.targetKey,
      );
      return [
        `${assessment.targetKey}: ${assessment.strength} (${assessment.strategyMode})`,
        `Fact ids: ${assessment.supportingFactIds.join(", ") || "(none)"}`,
        `Role ids: ${assessment.relevantRoleIds.join(", ") || "(none)"}`,
        `Explanation: ${prose?.explanation ?? ""}`,
        `Strategy: ${prose?.strategy ?? ""}`,
      ].join("\n");
    })
    .join("\n\n");
  const writing = input.writing;
  return [
    writing?.commentary ?? "",
    "",
    "Standing:",
    writing?.overall ?? "",
    "",
    "Angles:",
    ...(writing?.strongestAngles ?? []).map((angle) => `- ${angle}`),
    "",
    "Gaps:",
    ...(writing?.importantGaps ?? []).map((gap) => `- ${gap}`),
    "",
    "Assessments:",
    assessments || "(none)",
    "",
    "Questions:",
    questions || "(none)",
    "",
    `Closing: ${writing?.closingNote ?? ""}`,
    input.writingError ? `\nWriting call failed: ${input.writingError}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

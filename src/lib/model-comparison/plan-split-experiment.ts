/**
 * Experimental planning split used only by the model comparison script.
 * These instructions are not Harper's production coach. They need product-owner
 * approval before any production use. planAndStoreRound does not import this file.
 */
import { z } from "zod";
import type { AiMessage } from "@/lib/ai/types";
import {
  consultationPlanSchema,
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

export const LEAN_DECISION_SCHEMA_NAME =
  "consultation_plan_lean_decision_experiment";
export const LEAN_WRITING_SCHEMA_NAME =
  "consultation_plan_lean_writing_experiment";

/** Strengths and questions only. No fact ids, role ids, or prose. */
export const leanDecisionSchema = z.object({
  assessments: z.array(
    z.object({
      targetKey: z.string(),
      strength: strengthSchema,
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

/**
 * Fact and role ids plus the current split's writing fields.
 * Locked decision fields are not in this schema. If the raw payload still
 * includes them, combineLeanDecisionAndWriting restores the decision.
 */
export const leanWritingSchema = z.object({
  overall: z.string(),
  strongestAngles: z.array(z.string()),
  importantGaps: z.array(z.string()),
  commentary: z.string(),
  closingNote: z.string().nullable(),
  assessments: z.array(
    z.object({
      targetKey: z.string(),
      supportingFactIds: z.array(z.string()),
      relevantRoleIds: z.array(z.string()),
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

export type LeanDecision = z.infer<typeof leanDecisionSchema>;
export type LeanWriting = z.infer<typeof leanWritingSchema>;

export const EXPERIMENTAL_LEAN_DECISION_INSTRUCTIONS = `EXPERIMENTAL. Not production. For this comparison script only. Do not treat this as Harper's live coach.

You decide strengths and questions only. Do not return fact ids, role ids, standing summary, angles, gap essays, commentary, closing note, explanation, strategy prose, who-cares note, or requirement interpretation.

Rate every target STRONG, PARTIAL, or NONE. Set strategyMode to PROVE_WITH_STORY, REFRAME_ADJACENT, or ACKNOWLEDGE. Do not invent employers, titles, metrics, or skills.

Ask one question per remaining gap, most important first. Across this application, including askedQuestions, never more than ${questionCap} questions. Never repeat or closely rephrase askedQuestions, including questions marked ignored. Question text is specific to this person's roles and this job. Do not paste requirement, responsibility, or posting text into a question. Mission statements, company taglines, and recruiting pitches are not gaps. Do not ask about a target you rated STRONG. The career walk-through comes only from recentRoles, at most once, and never for a role that ended more than 10 years ago. Never ask the person to walk through their whole career or start from their first job.

Each question has targetKey, text, hiringTeamRoleId (one supplied Hiring Team role id), and interviewTypeTag (screening, chronological_walk_through, focused_competency, or reference_check_prep). Use chronological_walk_through only for the career walk-through.

Match careerStage: for new_to_workforce or college_graduate, ask about school, internships, projects, part-time work, and activities when the profile has them; for early_career through late_career, ask about roles and results at the level of this job.

When interviewerPrep is present, this round is prep for that person. Ask only what that person will probe. Do not assess the interviewer as a skill. Do not add a question whose text is that you are preparing them for this interviewer.

When focusTargetKey is present, the first question targets it.

Return JSON matching the schema only.`;

export const EXPERIMENTAL_LEAN_WRITING_INSTRUCTIONS = `EXPERIMENTAL. Not production. For this comparison script only. Do not treat this as Harper's live coach.

The decision is given in the decision object. Do not add, drop, or reword questions. Do not change strengths, strategy mode, Hiring Team role id, or interview-type tag. Write prose and choose ids for the decision's targets and questions only.

For every assessment, choose supportingFactIds only from FACT ids in the supplied personal profile, and relevantRoleIds only from the supplied role ids. The ids must support that target's strength and strategyMode. Drop any id that was not supplied. Do not invent employers, titles, metrics, or skills.

Write overall as an honest two-to-four sentence standing for this job, spoken to the person as "you". Write two or three strongestAngles, concrete advantages from the profile. Write importantGaps as observations of what is missing, never as instructions. If the decision has no remaining gaps, write one sentence that says there are no remaining experience gaps for this job.

For every assessment in the decision, write explanation and a short strategy that follows that assessment's strategyMode and uses only experience you cited. For every question, write whoCaresNote from the supplied persona, naming that role and what that person needs to hear. Write requirementInterpretation when the question is about a vague requirement; otherwise null.

Write commentary for this round, spoken as "you". Write closingNote only when the decision has no questions; otherwise null. When interviewerPrep is present, commentary is the opening the seeker sees: what this person will likely probe, which of their stories fit, and the questions for weak spots. Do not call it a question plan.

Never put an id in prose. Speak to the person as "you".

Return JSON matching the schema only.`;

export function leanDecisionMessages(coachMessages: AiMessage[]): AiMessage[] {
  return [
    { role: "system", content: EXPERIMENTAL_LEAN_DECISION_INSTRUCTIONS },
    ...coachMessages.filter((message) => message.role !== "system"),
  ];
}

export function leanWritingMessages(
  coachMessages: AiMessage[],
  decision: LeanDecision,
): AiMessage[] {
  return [
    { role: "system", content: EXPERIMENTAL_LEAN_WRITING_INSTRUCTIONS },
    ...coachMessages.filter((message) => message.role !== "system"),
    {
      role: "user",
      content: JSON.stringify({ decision }),
    },
  ];
}

export function suppliedEvidenceIds(messages: AiMessage[]): {
  factIds: Set<string>;
  roleIds: Set<string>;
} {
  const factIds = new Set<string>();
  const roleIds = new Set<string>();
  for (const message of messages) {
    if (!message.content.startsWith("{")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message.content);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.personalProfileItems)) {
      for (const item of record.personalProfileItems) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        if (row.kind === "FACT" && typeof row.id === "string" && row.id) {
          factIds.add(row.id);
        }
        if (row.itemType === "EXPERIENCE" && typeof row.id === "string" && row.id) {
          roleIds.add(row.id);
        }
        if (typeof row.roleId === "string" && row.roleId) roleIds.add(row.roleId);
      }
    }
    if (Array.isArray(record.recentRoles)) {
      for (const role of record.recentRoles) {
        if (!role || typeof role !== "object") continue;
        const id = (role as Record<string, unknown>).id;
        if (typeof id === "string" && id) roleIds.add(id);
      }
    }
  }
  return { factIds, roleIds };
}

function rawRows(value: unknown, key: string): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object") return [];
  const rows = (value as Record<string, unknown>)[key];
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (row): row is Record<string, unknown> =>
      Boolean(row) && typeof row === "object" && !Array.isArray(row),
  );
}

function rawString(row: Record<string, unknown> | undefined, key: string): string | null {
  if (!row) return null;
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function keepSuppliedIds(
  ids: string[],
  allowed: ReadonlySet<string>,
  label: string,
  targetKey: string,
  notes: string[],
): string[] {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const id of ids) {
    if (allowed.has(id)) kept.push(id);
    else dropped.push(id);
  }
  if (dropped.length > 0) {
    notes.push(
      `Dropped ${label} for ${targetKey} not in the supplied ids: ${dropped.join(", ")}.`,
    );
  }
  return kept;
}

export function combineLeanDecisionAndWriting(input: {
  decision: LeanDecision;
  writingRaw: unknown;
  suppliedFactIds: ReadonlySet<string>;
  suppliedRoleIds: ReadonlySet<string>;
}): {
  plan: z.infer<typeof consultationPlanSchema> | null;
  notes: string[];
} {
  const notes: string[] = [];
  const writing = leanWritingSchema.safeParse(input.writingRaw);
  if (!writing.success) {
    notes.push("Lean writing did not match its schema.");
    return { plan: null, notes };
  }
  const rawAssessments = rawRows(input.writingRaw, "assessments");
  const rawQuestions = rawRows(input.writingRaw, "questions");
  const decisionAssessmentKeys = new Set(
    input.decision.assessments.map((assessment) => assessment.targetKey),
  );
  const decisionQuestionKeys = new Set(
    input.decision.questions.map((question) => question.targetKey),
  );

  for (const row of rawAssessments) {
    const targetKey = rawString(row, "targetKey");
    if (targetKey && !decisionAssessmentKeys.has(targetKey)) {
      notes.push(
        `Ignored assessment ${targetKey} because it is not in the decision.`,
      );
    }
  }
  for (const row of rawQuestions) {
    const targetKey = rawString(row, "targetKey");
    if (targetKey && !decisionQuestionKeys.has(targetKey)) {
      notes.push(
        `Ignored question ${targetKey} because it is not in the decision.`,
      );
    }
  }

  const assessments = input.decision.assessments.map((decision) => {
    const prose = writing.data.assessments.find(
      (item) => item.targetKey === decision.targetKey,
    );
    const raw = rawAssessments.find(
      (row) => rawString(row, "targetKey") === decision.targetKey,
    );
    if (!prose) {
      notes.push(
        `Writing omitted assessment ${decision.targetKey}; kept the decision's strength and strategy mode.`,
      );
    }
    const rawStrength = rawString(raw, "strength");
    if (rawStrength && rawStrength !== decision.strength) {
      notes.push(
        `Restored assessment ${decision.targetKey} strength from the decision (rejected ${rawStrength}).`,
      );
    }
    const rawMode = rawString(raw, "strategyMode");
    if (rawMode && rawMode !== decision.strategyMode) {
      notes.push(
        `Restored assessment ${decision.targetKey} strategyMode from the decision (rejected ${rawMode}).`,
      );
    }
    return {
      targetKey: decision.targetKey,
      strength: decision.strength,
      supportingFactIds: keepSuppliedIds(
        prose?.supportingFactIds ?? [],
        input.suppliedFactIds,
        "supportingFactIds",
        decision.targetKey,
        notes,
      ),
      relevantRoleIds: keepSuppliedIds(
        prose?.relevantRoleIds ?? [],
        input.suppliedRoleIds,
        "relevantRoleIds",
        decision.targetKey,
        notes,
      ),
      explanation: prose?.explanation ?? "",
      strategyMode: decision.strategyMode,
      strategy: prose?.strategy ?? "",
    };
  });

  const questions = input.decision.questions.map((decision) => {
    const prose = writing.data.questions.find(
      (item) => item.targetKey === decision.targetKey,
    );
    const raw = rawQuestions.find(
      (row) => rawString(row, "targetKey") === decision.targetKey,
    );
    if (!prose) {
      notes.push(
        `Writing omitted question ${decision.targetKey}; kept the decision's question.`,
      );
    }
    const rawText = rawString(raw, "text");
    if (rawText && rawText !== decision.text) {
      notes.push(
        `Restored question ${decision.targetKey} text from the decision (rejected ${rawText}).`,
      );
    }
    const rawRole = rawString(raw, "hiringTeamRoleId");
    if (rawRole && rawRole !== decision.hiringTeamRoleId) {
      notes.push(
        `Restored question ${decision.targetKey} hiringTeamRoleId from the decision (rejected ${rawRole}).`,
      );
    }
    const rawTag = rawString(raw, "interviewTypeTag");
    if (rawTag && rawTag !== decision.interviewTypeTag) {
      notes.push(
        `Restored question ${decision.targetKey} interviewTypeTag from the decision (rejected ${rawTag}).`,
      );
    }
    return {
      targetKey: decision.targetKey,
      text: decision.text,
      requirementInterpretation: prose?.requirementInterpretation ?? null,
      hiringTeamRoleId: decision.hiringTeamRoleId,
      whoCaresNote: prose?.whoCaresNote ?? "",
      interviewTypeTag: decision.interviewTypeTag,
    };
  });

  const built = {
    commentary: writing.data.commentary,
    briefing: {
      overall: writing.data.overall,
      strongestAngles: writing.data.strongestAngles,
      importantGaps: writing.data.importantGaps,
      storyPlan: [] as string[],
    },
    closingNote: writing.data.closingNote,
    assessments,
    questions,
  };
  const parsed = consultationPlanSchema.safeParse(built);
  if (!parsed.success) {
    notes.push(
      "Combined result did not match today's planning shape.",
    );
    return { plan: null, notes };
  }
  return { plan: parsed.data, notes };
}

export function formatLeanSplit(input: {
  plan: z.infer<typeof consultationPlanSchema> | null;
  notes: string[];
  writingError: string | null;
}): string {
  const plan = input.plan;
  const questions =
    plan?.questions
      .map((question, index) =>
        [
          `${index + 1}. ${question.text}`,
          `Target: ${question.targetKey}`,
          `Hiring Team role: ${question.hiringTeamRoleId}`,
          `Interview type: ${question.interviewTypeTag}`,
          `Who cares: ${question.whoCaresNote}`,
          `Requirement interpretation: ${question.requirementInterpretation ?? ""}`,
        ].join("\n"),
      )
      .join("\n\n") ?? "(none)";
  const assessments =
    plan?.assessments
      .map((assessment) =>
        [
          `${assessment.targetKey}: ${assessment.strength} (${assessment.strategyMode})`,
          `Fact ids: ${assessment.supportingFactIds.join(", ") || "(none)"}`,
          `Role ids: ${assessment.relevantRoleIds.join(", ") || "(none)"}`,
          `Explanation: ${assessment.explanation}`,
          `Strategy: ${assessment.strategy}`,
        ].join("\n"),
      )
      .join("\n\n") ?? "(none)";
  return [
    plan?.commentary ?? "",
    "",
    "Standing:",
    plan?.briefing.overall ?? "",
    "",
    "Angles:",
    ...(plan?.briefing.strongestAngles ?? []).map((angle) => `- ${angle}`),
    "",
    "Gaps:",
    ...(plan?.briefing.importantGaps ?? []).map((gap) => `- ${gap}`),
    "",
    "Assessments:",
    assessments,
    "",
    "Questions:",
    questions,
    "",
    `Closing: ${plan?.closingNote ?? ""}`,
    "",
    "Restored or rejected:",
    ...(input.notes.length > 0 ? input.notes : ["No decision fields were changed."]),
    input.writingError ? `Writing call failed: ${input.writingError}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

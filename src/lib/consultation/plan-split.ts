/**
 * Production lean planning split.
 * Terra decides strengths and questions. Luna writes fact ids, role ids, and prose.
 * The combined object is today's ConsultationPlanResult.
 */
import { z } from "zod";
import { fingerprintPaidCallInputs } from "@/lib/ai/paid-call-gate";
import type { AiMessage } from "@/lib/ai/types";
import {
  CONSULTATION_PLAN_DECISION_PROMPT_VERSION,
  CONSULTATION_PLAN_WRITING_PROMPT_VERSION,
  consultationPlanSchema,
  interviewTypeTagSchema,
  type ConsultationPlanResult,
} from "@/lib/consultation/contract";

export const CONSULTATION_PLAN_DECISION_SCHEMA_NAME = "consultation_plan_decision";
export const CONSULTATION_PLAN_WRITING_SCHEMA_NAME = "consultation_plan_writing";

const strengthSchema = z.enum(["STRONG", "PARTIAL", "NONE"]);
const strategyModeSchema = z.enum([
  "PROVE_WITH_STORY",
  "REFRAME_ADJACENT",
  "ACKNOWLEDGE",
]);

/** Strengths and questions only. No fact ids, role ids, or prose. */
export const consultationPlanDecisionSchema = z.object({
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
 * Fact and role ids plus every writing field.
 * Locked decision fields are not in this schema. If the raw payload still
 * includes them, combinePlanDecisionAndWriting restores the decision.
 */
export const consultationPlanWritingSchema = z.object({
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

export type ConsultationPlanDecision = z.infer<typeof consultationPlanDecisionSchema>;
export type ConsultationPlanWriting = z.infer<typeof consultationPlanWritingSchema>;

export function isPlanDecisionUsable(stored: ConsultationPlanDecision): boolean {
  return (
    stored.assessments.every(
      (assessment) =>
        assessment.targetKey.trim().length > 0 && Boolean(assessment.strength),
    ) &&
    stored.questions.every(
      (question) =>
        question.targetKey.trim().length > 0 && question.text.trim().length > 0,
    )
  );
}

export function isPlanWritingUsable(
  stored: ConsultationPlanResult,
  decision: ConsultationPlanDecision,
): boolean {
  if (!stored.briefing.overall.trim()) return false;
  return decision.assessments.every((assessment) => {
    const written = stored.assessments.find(
      (item) => item.targetKey === assessment.targetKey,
    );
    return Boolean(written?.explanation.trim());
  });
}

function decisionModelIdentity(): { provider: string; model: string } {
  return {
    provider: process.env.CONSULTATION_AI_PROVIDER?.trim() || "consultation",
    model: process.env.CONSULTATION_AI_MODEL?.trim() || "consultation",
  };
}

function writingModelIdentity(): { provider: string; model: string } {
  return {
    provider:
      process.env.CONSULTATION_REPLY_AI_PROVIDER?.trim() || "consultation_reply",
    model: process.env.CONSULTATION_REPLY_AI_MODEL?.trim() || "consultation_reply",
  };
}

/** Provider, model, decision prompt version, schema name, and the decision messages. */
export function consultationPlanDecisionFingerprint(messages: AiMessage[]): string {
  return fingerprintPaidCallInputs({
    ...decisionModelIdentity(),
    promptVersion: CONSULTATION_PLAN_DECISION_PROMPT_VERSION,
    schemaName: CONSULTATION_PLAN_DECISION_SCHEMA_NAME,
    messages,
  });
}

/**
 * Writing prompt version, schema name, the canonical decision, and the
 * context messages luna receives. A new decision changes this hash.
 */
export function consultationPlanWritingFingerprint(input: {
  messages: AiMessage[];
  decision: ConsultationPlanDecision;
}): string {
  return fingerprintPaidCallInputs({
    ...writingModelIdentity(),
    promptVersion: CONSULTATION_PLAN_WRITING_PROMPT_VERSION,
    schemaName: CONSULTATION_PLAN_WRITING_SCHEMA_NAME,
    decision: input.decision,
    messages: input.messages,
  });
}

export function consultationPlanWritingSubjectKey(input: {
  campaignId: string;
  sessionId: string;
  inputFingerprint: string;
}): string {
  return `${input.campaignId}:${input.sessionId}:${input.inputFingerprint}`;
}

type EvidenceRow = {
  id?: string;
  kind?: string;
  itemType?: string;
  roleId?: string | null;
};

function addApprovedAnswerIds(
  factIds: Set<string>,
  answers: ReadonlyArray<{ id?: string | null }> | undefined,
): void {
  for (const answer of answers ?? []) {
    const id = answer?.id?.trim() ?? "";
    if (id.startsWith("approved:") && id.length > "approved:".length) {
      factIds.add(id);
    }
  }
}

/** Fact and role ids the coach was given. Anything else luna returns is dropped. */
export function suppliedProfileEvidenceIds(input: {
  profileItems: EvidenceRow[];
  recentRoles: Array<{ id: string }>;
  seekerStatedFacts?: Array<{ id: string }>;
  approvedAnswers?: ReadonlyArray<{ id: string }>;
}): { factIds: Set<string>; roleIds: Set<string> } {
  const factIds = new Set<string>();
  const roleIds = new Set<string>();
  for (const item of input.profileItems) {
    if (item.kind === "FACT" && item.id) factIds.add(item.id);
    if (item.itemType === "EXPERIENCE" && item.id) roleIds.add(item.id);
    if (item.roleId) roleIds.add(item.roleId);
  }
  for (const role of input.recentRoles) {
    if (role.id) roleIds.add(role.id);
  }
  for (const fact of input.seekerStatedFacts ?? []) {
    if (fact.id) factIds.add(fact.id);
  }
  addApprovedAnswerIds(factIds, input.approvedAnswers);
  return { factIds, roleIds };
}

/** Same id rules, read from the coach message payloads the comparison script already built. */
export function suppliedEvidenceIdsFromMessages(messages: AiMessage[]): {
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
    const profileItems = Array.isArray(record.personalProfileItems)
      ? (record.personalProfileItems as EvidenceRow[])
      : [];
    const recentRoles = Array.isArray(record.recentRoles)
      ? (record.recentRoles as Array<{ id?: string }>)
      : [];
    const seekerStatedFacts = Array.isArray(record.seekerStatedFacts)
      ? (record.seekerStatedFacts as Array<{ id?: string }>)
      : [];
    const approvedAnswers = Array.isArray(record.approvedAnswers)
      ? (record.approvedAnswers as Array<{ id?: string }>)
      : [];
    const collected = suppliedProfileEvidenceIds({
      profileItems,
      recentRoles: recentRoles.flatMap((role) =>
        role?.id ? [{ id: role.id }] : [],
      ),
      seekerStatedFacts: seekerStatedFacts.flatMap((fact) =>
        fact?.id ? [{ id: fact.id }] : [],
      ),
      approvedAnswers: approvedAnswers.flatMap((answer) =>
        answer?.id ? [{ id: answer.id }] : [],
      ),
    });
    for (const id of collected.factIds) factIds.add(id);
    for (const id of collected.roleIds) roleIds.add(id);
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

function rawString(
  row: Record<string, unknown> | undefined,
  key: string,
): string | null {
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

export function logPlanWritingAdjustments(notes: string[]): void {
  for (const note of notes) {
    console.error(
      JSON.stringify({
        event: "consultation_plan_writing_adjusted",
        note,
      }),
    );
  }
}

export function combinePlanDecisionAndWriting(input: {
  decision: ConsultationPlanDecision;
  writingRaw: unknown;
  suppliedFactIds: ReadonlySet<string>;
  suppliedRoleIds: ReadonlySet<string>;
}): {
  plan: ConsultationPlanResult | null;
  notes: string[];
} {
  const notes: string[] = [];
  const writing = consultationPlanWritingSchema.safeParse(input.writingRaw);
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
    notes.push("Combined result did not match today's planning shape.");
    return { plan: null, notes };
  }
  return { plan: parsed.data, notes };
}

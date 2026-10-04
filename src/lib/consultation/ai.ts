import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type { AiCallUsageContext, AiMessage } from "@/lib/ai/types";
import {
  fingerprintPaidCallInputs,
  runPaidStructuredCall,
  type PaidCallOperation,
} from "@/lib/ai/paid-call-gate";
import {
  getConsultationAiProvider,
  getConsultationReplyAiProvider,
  isConsultationAiConfigured,
  isConsultationReplyAiConfigured,
} from "@/lib/ai";
import type { CareerStage } from "@/lib/consultation/career-stage";
import type { ApprovedAnswerEvidence } from "@/lib/consultation/harper-library";
import {
  CONSULTATION_PROMPT_VERSION,
  consultationPlanSchema,
  consultationExtractSchema,
  consultationPolishSchema,
  type ApplicationLearningsForCoach,
  type AskedConsultationQuestion,
  type CoachCompanyResearch,
  type CoachHiringTeamRole,
  type ConsultationPlanResult,
  type ConsultationExtractResult,
  type ConsultationPolishResult,
  type InterviewerPrepPayload,
  type SeekerStatedFactPayload,
} from "@/lib/consultation/contract";
import {
  combinePlanDecisionAndWriting,
  consultationPlanDecisionFingerprint,
  consultationPlanDecisionSchema,
  consultationPlanWritingSchema,
  consultationPlanWritingFingerprint,
  consultationPlanWritingSubjectKey,
  isPlanDecisionUsable,
  isPlanWritingUsable,
  logPlanWritingAdjustments,
  suppliedProfileEvidenceIds,
  type ConsultationPlanDecision,
} from "@/lib/consultation/plan-split";
import type { RecentRole } from "@/lib/consultation/recent-roles";
import {
  buildConsultationExtractMessages,
  buildConsultationPlanDecisionMessages,
  buildConsultationPlanWritingMessages,
  buildConsultationPolishMessages,
} from "@/lib/consultation/prompt";
import { consultationConversationCopy } from "@/lib/product-config";
import { aiCallTracking } from "@/lib/usage/ai-call";

export type ConsultationPlanAiResult =
  | { ok: true; data: ConsultationPlanResult; writingFailed: false }
  | {
      ok: true;
      writingFailed: true;
      decision: ConsultationPlanDecision;
      message: string;
    }
  | { ok: false; message: string };

const UNCONFIGURED = consultationConversationCopy.modelUnavailable;
const REPLY_UNCONFIGURED =
  "Consultation reply AI is not configured. Configure CONSULTATION_REPLY_AI_*, then retry.";

function tracking(usage?: AiCallUsageContext) {
  return usage ? aiCallTracking(usage) : {};
}

function planStepUsage(
  usage: AiCallUsageContext | undefined,
  operation: "CONSULTATION" | "CONSULTATION_REPLY",
  step: "plan_decision" | "plan_writing",
): AiCallUsageContext | undefined {
  if (!usage) return undefined;
  return {
    ...usage,
    operation,
    metadata: { ...(usage.metadata ?? {}), step },
  };
}

export const CONSULTATION_EXTRACT_OPERATION =
  "CONSULTATION_EXTRACT" satisfies PaidCallOperation;
export const CONSULTATION_POLISH_OPERATION =
  "CONSULTATION_POLISH" satisfies PaidCallOperation;
export const CONSULTATION_STATEMENT_REGENERATE_OPERATION =
  "CONSULTATION_STATEMENT_REGENERATE" satisfies PaidCallOperation;
export const CONSULTATION_PLAN_OPERATION =
  "CONSULTATION_PLAN" satisfies PaidCallOperation;
export const CONSULTATION_PLAN_WRITING_OPERATION =
  "CONSULTATION_PLAN_WRITING" satisfies PaidCallOperation;

function planModelIdentity(): { provider: string; model: string } {
  return {
    provider: process.env.CONSULTATION_AI_PROVIDER?.trim() || "consultation",
    model: process.env.CONSULTATION_AI_MODEL?.trim() || "consultation",
  };
}

/** Model, prompt version, and the full coach message payload, including quality feedback. */
export function consultationPlanCallFingerprint(messages: AiMessage[]): string {
  return fingerprintPaidCallInputs({
    ...planModelIdentity(),
    promptVersion: CONSULTATION_PROMPT_VERSION,
    messages,
  });
}

/**
 * Receipts are one row per operation and subject. The fingerprint is part of
 * the key so a later quality attempt cannot replace an earlier attempt's plan.
 */
export function consultationPlanSubjectKey(input: {
  campaignId: string;
  sessionId: string;
  inputFingerprint: string;
}): string {
  return `${input.campaignId}:${input.sessionId}:${input.inputFingerprint}`;
}

type PlanModelInput = {
  targets: Array<{ key: string; kind: string; text: string }>;
  profileItems: Array<{
    id: string;
    kind: string;
    text: string;
    itemType: string;
    employer?: string | null;
    title?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    roleId?: string | null;
  }>;
  careerStage: CareerStage;
  recentRoles: RecentRole[];
  hiringTeam: CoachHiringTeamRole[];
  applicationLearningsPendingHiringManager?: ApplicationLearningsForCoach | null;
  seekerStatedFacts: SeekerStatedFactPayload[];
  approvedAnswers?: readonly ApprovedAnswerEvidence[];
  companyResearch: CoachCompanyResearch | null;
  askedQuestions: AskedConsultationQuestion[];
  chronologyRequested: boolean;
  coveredTargetKeys: string[];
  focusTargetKey?: string | null;
  interviewerPrep?: InterviewerPrepPayload | null;
  qualityFeedback?: string[];
  sessionId?: string | null;
  usage?: AiCallUsageContext;
};

function replyModelIdentity(): { provider: string; model: string } {
  return {
    provider:
      process.env.CONSULTATION_REPLY_AI_PROVIDER?.trim() || "consultation_reply",
    model: process.env.CONSULTATION_REPLY_AI_MODEL?.trim() || "consultation_reply",
  };
}

/** Model, prompt version, and the full message payload, including quality feedback. */
export function consultationAnswerCallFingerprint(messages: AiMessage[]): string {
  return fingerprintPaidCallInputs({
    ...replyModelIdentity(),
    promptVersion: CONSULTATION_PROMPT_VERSION,
    messages,
  });
}

/**
 * Receipts are one row per operation and subject. The fingerprint is part of
 * the key so a later quality attempt cannot replace an earlier attempt's result.
 */
export function consultationAnswerSubjectKey(input: {
  campaignId: string;
  questionKey: string;
  inputFingerprint: string;
}): string {
  return `${input.campaignId}:${input.questionKey}:${input.inputFingerprint}`;
}

function polishPaidOperation(usage?: AiCallUsageContext): PaidCallOperation {
  return usage?.metadata?.step === "statement_regeneration"
    ? CONSULTATION_STATEMENT_REGENERATE_OPERATION
    : CONSULTATION_POLISH_OPERATION;
}

async function runReplyPaidCall<T>(input: {
  operation: PaidCallOperation;
  usage?: AiCallUsageContext;
  questionKey?: string | null;
  targetKey?: string | null;
  messages: AiMessage[];
  parseStored: (json: unknown) => T;
  isResultUsable: (stored: T) => boolean;
  callProvider: () => Promise<T>;
}): Promise<T> {
  const organizationId = input.usage?.organizationId?.trim();
  const campaignId = input.usage?.campaignId?.trim() ?? "";
  const questionKey =
    input.questionKey?.trim() || input.targetKey?.trim() || "";
  if (!organizationId || !campaignId || !questionKey) {
    return input.callProvider();
  }
  const inputFingerprint = consultationAnswerCallFingerprint(input.messages);
  const gated = await runPaidStructuredCall({
    organizationId,
    operation: input.operation,
    subjectKey: consultationAnswerSubjectKey({
      campaignId,
      questionKey,
      inputFingerprint,
    }),
    inputFingerprint,
    parseStored: input.parseStored,
    isResultUsable: input.isResultUsable,
    callProvider: input.callProvider,
  });
  return gated.data;
}

export async function planConsultationWithModel(
  input: PlanModelInput,
): Promise<ConsultationPlanAiResult> {
  const decision = await runConsultationPlanDecision(input);
  if (!decision.ok) return decision;
  const writing = await runConsultationPlanWriting({
    ...input,
    decision: decision.data,
  });
  if (!writing.ok) {
    return {
      ok: true,
      writingFailed: true,
      decision: decision.data,
      message: writing.message,
    };
  }
  return { ok: true, writingFailed: false, data: writing.data };
}

export async function runConsultationPlanDecision(
  input: PlanModelInput,
): Promise<
  | { ok: true; data: ConsultationPlanDecision; skipped: boolean }
  | { ok: false; message: string }
> {
  if (!isConsultationAiConfigured()) {
    console.error(
      JSON.stringify({
        event: "consultation_coach_failed",
        cause: "CONSULTATION_AI_not_configured",
        message: UNCONFIGURED,
      }),
    );
    return { ok: false, message: UNCONFIGURED };
  }
  const messages = buildConsultationPlanDecisionMessages(input);
  const callProvider = async () => {
    const response = await getConsultationAiProvider().generateStructured({
      ...structuredOutputRequest("consultationPlanDecision"),
      ...tracking(planStepUsage(input.usage, "CONSULTATION", "plan_decision")),
      messages,
      parseOutput: (raw) => ({
        data: consultationPlanDecisionSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return response.data;
  };
  try {
    const organizationId = input.usage?.organizationId?.trim();
    const campaignId = input.usage?.campaignId?.trim();
    const sessionId = input.sessionId?.trim();
    if (!organizationId || !campaignId || !sessionId) {
      const data = await callProvider();
      if (!isPlanDecisionUsable(data)) {
        return { ok: false, message: consultationConversationCopy.planUnusable };
      }
      return { ok: true, data, skipped: false };
    }
    const inputFingerprint = consultationPlanDecisionFingerprint(messages);
    const gated = await runPaidStructuredCall({
      organizationId,
      operation: CONSULTATION_PLAN_OPERATION,
      subjectKey: consultationPlanSubjectKey({
        campaignId,
        sessionId,
        inputFingerprint,
      }),
      inputFingerprint,
      parseStored: (json) => consultationPlanDecisionSchema.parse(json),
      isResultUsable: isPlanDecisionUsable,
      callProvider,
    });
    if (!isPlanDecisionUsable(gated.data)) {
      return { ok: false, message: consultationConversationCopy.planUnusable };
    }
    return { ok: true, data: gated.data, skipped: gated.skipped };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : message;
    console.error(
      JSON.stringify({ event: "consultation_coach_failed", message, cause }),
    );
    return {
      ok: false,
      message: consultationConversationCopy.planUnusable,
    };
  }
}

export async function runConsultationPlanWriting(
  input: PlanModelInput & { decision: ConsultationPlanDecision },
): Promise<
  | { ok: true; data: ConsultationPlanResult; skipped: boolean }
  | { ok: false; message: string }
> {
  if (!isConsultationReplyAiConfigured()) {
    console.error(
      JSON.stringify({
        event: "consultation_plan_writing_failed",
        cause: "CONSULTATION_REPLY_AI_not_configured",
        message: REPLY_UNCONFIGURED,
      }),
    );
    return { ok: false, message: REPLY_UNCONFIGURED };
  }
  const supplied = suppliedProfileEvidenceIds({
    profileItems: input.profileItems,
    recentRoles: input.recentRoles,
    seekerStatedFacts: input.seekerStatedFacts,
    approvedAnswers: input.approvedAnswers,
  });
  const messages = buildConsultationPlanWritingMessages(input, input.decision);
  const callProvider = async () => {
    let rawPayload: unknown;
    const response = await getConsultationReplyAiProvider().generateStructured({
      ...structuredOutputRequest("consultationPlanWriting"),
      ...tracking(planStepUsage(input.usage, "CONSULTATION_REPLY", "plan_writing")),
      messages,
      parseOutput: (raw) => {
        rawPayload = raw;
        return {
          data: consultationPlanWritingSchema.parse(raw),
          coercedFields: [],
        };
      },
    });
    return combineWritingOrThrow(rawPayload ?? response.data);
  };
  function combineWritingOrThrow(raw: unknown): ConsultationPlanResult {
    const combined = combinePlanDecisionAndWriting({
      decision: input.decision,
      writingRaw: raw,
      suppliedFactIds: supplied.factIds,
      suppliedRoleIds: supplied.roleIds,
    });
    logPlanWritingAdjustments(combined.notes);
    if (!combined.plan) {
      throw new Error(
        combined.notes.join(" ") || "Planning writing did not match today's shape.",
      );
    }
    return combined.plan;
  }
  try {
    const organizationId = input.usage?.organizationId?.trim();
    const campaignId = input.usage?.campaignId?.trim();
    const sessionId = input.sessionId?.trim();
    if (!organizationId || !campaignId || !sessionId) {
      const data = await callProvider();
      if (!isPlanWritingUsable(data, input.decision)) {
        return { ok: false, message: consultationConversationCopy.planUnusable };
      }
      return { ok: true, data, skipped: false };
    }
    const inputFingerprint = consultationPlanWritingFingerprint({
      messages,
      decision: input.decision,
    });
    const gated = await runPaidStructuredCall({
      organizationId,
      operation: CONSULTATION_PLAN_WRITING_OPERATION,
      subjectKey: consultationPlanWritingSubjectKey({
        campaignId,
        sessionId,
        inputFingerprint,
      }),
      inputFingerprint,
      parseStored: (json) => consultationPlanSchema.parse(json),
      isResultUsable: (stored) => isPlanWritingUsable(stored, input.decision),
      callProvider,
    });
    if (!isPlanWritingUsable(gated.data, input.decision)) {
      return { ok: false, message: consultationConversationCopy.planUnusable };
    }
    return { ok: true, data: gated.data, skipped: gated.skipped };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({ event: "consultation_plan_writing_failed", message }),
    );
    return { ok: false, message: consultationConversationCopy.planUnusable };
  }
}

export async function extractWithModel(input: {
  answer: string;
  seekerReplies?: string[];
  question: string;
  target: { key: string; kind: string; text: string } | null;
  targets: Array<{ key: string; kind: string; text: string }>;
  profileItems: Array<{
    id: string;
    kind: string;
    text: string;
    itemType: string;
    employer?: string | null;
    title?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    roleId?: string | null;
  }>;
  qualityFeedback?: string[];
  targetStrength?: "STRONG" | "PARTIAL" | "NONE" | null;
  supportingEvidence?: string[];
  followUpAlreadyUsed?: boolean;
  /** Question turn id, or the target key when the turn is not known. */
  questionKey?: string | null;
  usage?: AiCallUsageContext;
}): Promise<
  | { ok: true; data: ConsultationExtractResult }
  | { ok: false; message: string }
> {
  if (!isConsultationReplyAiConfigured()) {
    return { ok: false, message: REPLY_UNCONFIGURED };
  }
  const messages = buildConsultationExtractMessages(input);
  const callProvider = async () => {
    const response = await getConsultationReplyAiProvider().generateStructured({
      ...structuredOutputRequest("consultationExtract"),
      ...tracking(input.usage),
      messages,
      parseOutput: (raw) => ({
        data: consultationExtractSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return response.data;
  };
  try {
    const data = await runReplyPaidCall({
      operation: CONSULTATION_EXTRACT_OPERATION,
      usage: input.usage,
      questionKey: input.questionKey,
      targetKey: input.target?.key,
      messages,
      parseStored: (json) => consultationExtractSchema.parse(json),
      isResultUsable: (stored) =>
        stored.replyType === "answer" || stored.replyType === "feedback",
      callProvider,
    });
    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({ event: "consultation_extract_failed", message }),
    );
    return {
      ok: false,
      message: "Consultation answer analysis failed. Retry consultation.",
    };
  }
}

export async function polishAnswerWithModel(input: {
  answer: string;
  seekerReplies?: string[];
  story: {
    situation: string | null;
    task: string | null;
    action: string | null;
    result: string | null;
  };
  declinedFollowUp: boolean;
  confirmedGap?: boolean;
  whyThisCompany?: boolean;
  strengtheningNeeds: string[];
  qualityFeedback?: string[];
  target?: { key: string; kind: string; text: string } | null;
  targetStrength?: "STRONG" | "PARTIAL" | "NONE" | null;
  supportingEvidence?: string[];
  approvedAnswers?: ReadonlyArray<{
    id: string;
    question: string;
    content: string;
    approvedAt: string;
    sourceApplicationId: string;
  }>;
  companyResearch?: {
    companySummary: string | null;
    whatTheySell: string | null;
    businessModel: string | null;
    companySizeContext: string | null;
    hiringSignals: string[];
    riskSignals: string[];
    jobFocus: string | null;
    jobFocusDetail: string | null;
  } | null;
  voiceSamples?: Array<{ label: string; sampleText: string }>;
  careerStage: CareerStage;
  profileItems: Array<{
    id: string;
    kind: string;
    text: string;
    itemType: string;
    employer?: string | null;
    title?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    roleId?: string | null;
  }>;
  /** Question turn id, or the target key when the turn is not known. */
  questionKey?: string | null;
  usage?: AiCallUsageContext;
}): Promise<
  | { ok: true; data: ConsultationPolishResult }
  | { ok: false; message: string }
> {
  if (!isConsultationReplyAiConfigured()) {
    return { ok: false, message: REPLY_UNCONFIGURED };
  }
  const messages = buildConsultationPolishMessages(input);
  const callProvider = async () => {
    const response = await getConsultationReplyAiProvider().generateStructured({
      ...structuredOutputRequest("consultationPolish"),
      ...tracking(input.usage),
      messages,
      parseOutput: (raw) => ({
        data: consultationPolishSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return response.data;
  };
  try {
    const data = await runReplyPaidCall({
      operation: polishPaidOperation(input.usage),
      usage: input.usage,
      questionKey: input.questionKey,
      targetKey: input.target?.key,
      messages,
      parseStored: (json) => consultationPolishSchema.parse(json),
      isResultUsable: () => true,
      callProvider,
    });
    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({ event: "consultation_polish_failed", message }),
    );
    return {
      ok: false,
      message: "Consultation statements could not be generated. Retry consultation.",
    };
  }
}

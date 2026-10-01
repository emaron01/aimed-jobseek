import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type { AiCallUsageContext, AiMessage } from "@/lib/ai/types";
import {
  fingerprintPaidCallInputs,
  runPaidStructuredCall,
  type PaidCallOperation,
} from "@/lib/ai/paid-call-gate";
import {
  getConsultationReplyAiProvider,
  isConsultationReplyAiConfigured,
} from "@/lib/ai";
import {
  NEXT_STEP_PROMPT_VERSION,
  applicationNextStepSchema,
} from "@/lib/application/next-step-contract";
import { APPLICATION_NEXT_STEP_INSTRUCTIONS } from "@/lib/prompt-content/next-step";
import { enqueueApplicationJob } from "@/lib/application-jobs/service";
import { prisma } from "@/lib/prisma-client";
import {
  consultationConfig,
  consultationConversationCopy,
} from "@/lib/product-config";
import { aiCallTracking } from "@/lib/usage/ai-call";

export type NextStepState = {
  key: string;
  facts: Record<string, string | boolean | number | null>;
};

export function applicationNextStepState(input: {
  consultationStatus: string | null;
  consultationGenerationStatus: string | null;
  resumePlanStatus: string | null;
  coverPlanStatus: string | null;
  hasResume: boolean;
  hasCoverLetter: boolean;
  appliedAt: string | null;
}): NextStepState {
  if (!input.consultationStatus) {
    return { key: "consultation_not_started", facts: { consultation: "not_started" } };
  }
  if (input.consultationGenerationStatus === "FAILED") {
    return { key: "consultation_failed", facts: { consultation: "failed" } };
  }
  if (input.consultationStatus === "IN_PROGRESS") {
    return { key: "consultation_in_progress", facts: { consultation: "in_progress" } };
  }
  if (input.resumePlanStatus === "DRAFT") {
    return { key: "resume_plan_ready", facts: { resumePlan: "draft" } };
  }
  if (input.coverPlanStatus === "DRAFT") {
    return { key: "cover_plan_ready", facts: { coverPlan: "draft" } };
  }
  if (input.resumePlanStatus === "ACCEPTED" && !input.hasResume) {
    return { key: "resume_ready", facts: { resumePlan: "accepted", resume: false } };
  }
  if (input.coverPlanStatus === "ACCEPTED" && !input.hasCoverLetter) {
    return { key: "cover_ready", facts: { coverPlan: "accepted", coverLetter: false } };
  }
  if ((input.hasResume || input.hasCoverLetter) && !input.appliedAt) {
    return {
      key: "mark_applied",
      facts: { resume: input.hasResume, coverLetter: input.hasCoverLetter },
    };
  }
  if (input.appliedAt) {
    return { key: "applied", facts: { appliedAt: input.appliedAt } };
  }
  return { key: "assets_available", facts: { consultation: input.consultationStatus } };
}

export const APPLICATION_NEXT_STEP_OPERATION =
  "APPLICATION_NEXT_STEP" satisfies PaidCallOperation;

function nextStepModelIdentity(): { provider: string; model: string } {
  return {
    provider:
      process.env.CONSULTATION_REPLY_AI_PROVIDER?.trim() || "consultation_reply",
    model: process.env.CONSULTATION_REPLY_AI_MODEL?.trim() || "consultation_reply",
  };
}

function nextStepMessages(state: NextStepState): AiMessage[] {
  return [
    {
      role: "system",
      content: `Prompt version: ${NEXT_STEP_PROMPT_VERSION}\n\n${APPLICATION_NEXT_STEP_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        consultantName: consultationConfig.displayName,
      }),
    },
    {
      role: "user",
      content: JSON.stringify({
        state,
        rejectedPrevious: null,
      }),
    },
  ];
}

/** Model, prompt version, and the full next-step input. */
export function applicationNextStepCallFingerprint(messages: AiMessage[]): string {
  return fingerprintPaidCallInputs({
    ...nextStepModelIdentity(),
    promptVersion: NEXT_STEP_PROMPT_VERSION,
    messages,
  });
}

export function applicationNextStepSubjectKey(input: {
  campaignId: string;
  inputFingerprint: string;
}): string {
  return `${input.campaignId}:${input.inputFingerprint}`;
}

export async function writeApplicationNextStep(input: {
  state: NextStepState;
  usage?: AiCallUsageContext;
}): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  if (!isConsultationReplyAiConfigured()) {
    console.error(
      JSON.stringify({
        event: "application_next_step_failed",
        cause: "CONSULTATION_REPLY_AI_not_configured",
      }),
    );
    return { ok: false, message: consultationConversationCopy.nextStepModelUnavailable };
  }
  try {
    let lastFailure: string = consultationConversationCopy.nextStepFailed;
    for (
      let attempt = 0;
      attempt <= consultationConfig.qualityRegenerationAttempts;
      attempt += 1
    ) {
      try {
        const messages = nextStepMessages(input.state);
        const callProvider = async () => {
          const response = await getConsultationReplyAiProvider().generateStructured({
            ...structuredOutputRequest("applicationNextStep"),
            ...(input.usage ? aiCallTracking(input.usage) : {}),
            messages,
            parseOutput: (raw) => ({
              data: applicationNextStepSchema.parse(raw),
              coercedFields: [],
            }),
          });
          return response.data;
        };
        const organizationId = input.usage?.organizationId?.trim();
        const campaignId = input.usage?.campaignId?.trim();
        const inputFingerprint = applicationNextStepCallFingerprint(messages);
        const data =
          organizationId && campaignId
            ? (
                await runPaidStructuredCall({
                  organizationId,
                  operation: APPLICATION_NEXT_STEP_OPERATION,
                  subjectKey: applicationNextStepSubjectKey({
                    campaignId,
                    inputFingerprint,
                  }),
                  inputFingerprint,
                  parseStored: (json) => applicationNextStepSchema.parse(json),
                  isResultUsable: (stored) =>
                    typeof stored.text === "string" && stored.text.trim().length > 0,
                  callProvider,
                })
              ).data
            : await callProvider();
        return { ok: true, text: data.text };
      } catch (error) {
        lastFailure =
          error instanceof Error
            ? error.message
            : consultationConversationCopy.nextStepFailed;
      }
    }
    return { ok: false, message: lastFailure };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : message;
    console.error(
      JSON.stringify({ event: "application_next_step_failed", message, cause }),
    );
    return { ok: false, message: consultationConversationCopy.nextStepFailed };
  }
}

/**
 * Read the last saved next-step card. Never enqueues AI — page views use this.
 */
export async function readApplicationNextStep(input: {
  organizationId: string;
  campaignId: string;
}): Promise<{
  text: string | null;
  stateKey: string;
  failed: boolean;
}> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: {
      nextStepText: true,
      nextStepStateKey: true,
      appliedAt: true,
      consultationSession: {
        select: { status: true, generationStatus: true },
      },
      presentationPlans: { select: { type: true, status: true } },
      applicationAssets: { select: { type: true } },
    },
  });
  if (!campaign) {
    return { text: null, stateKey: "missing", failed: false };
  }
  const resumePlan = campaign.presentationPlans.find((plan) => plan.type === "RESUME");
  const coverPlan = campaign.presentationPlans.find(
    (plan) => plan.type === "COVER_LETTER",
  );
  const state = applicationNextStepState({
    consultationStatus: campaign.consultationSession?.status ?? null,
    consultationGenerationStatus:
      campaign.consultationSession?.generationStatus ?? null,
    resumePlanStatus: resumePlan?.status ?? null,
    coverPlanStatus: coverPlan?.status ?? null,
    hasResume: campaign.applicationAssets.some((asset) => asset.type === "RESUME"),
    hasCoverLetter: campaign.applicationAssets.some(
      (asset) => asset.type === "COVER_LETTER",
    ),
    appliedAt: campaign.appliedAt?.toISOString() ?? null,
  });
  if (campaign.nextStepStateKey === `failed:${state.key}`) {
    return { text: null, stateKey: state.key, failed: true };
  }
  return {
    text: campaign.nextStepText,
    stateKey: state.key,
    failed: false,
  };
}

/**
 * Enqueue next-step generation when application state changed (seeker action or
 * finished job). Page views must call readApplicationNextStep instead.
 */
export async function queueApplicationNextStepIfNeeded(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: {
      nextStepText: true,
      nextStepStateKey: true,
      appliedAt: true,
      consultationSession: {
        select: { status: true, generationStatus: true },
      },
      presentationPlans: { select: { type: true, status: true } },
      applicationAssets: { select: { type: true } },
    },
  });
  if (!campaign) return;
  const resumePlan = campaign.presentationPlans.find((plan) => plan.type === "RESUME");
  const coverPlan = campaign.presentationPlans.find(
    (plan) => plan.type === "COVER_LETTER",
  );
  const state = applicationNextStepState({
    consultationStatus: campaign.consultationSession?.status ?? null,
    consultationGenerationStatus:
      campaign.consultationSession?.generationStatus ?? null,
    resumePlanStatus: resumePlan?.status ?? null,
    coverPlanStatus: coverPlan?.status ?? null,
    hasResume: campaign.applicationAssets.some((asset) => asset.type === "RESUME"),
    hasCoverLetter: campaign.applicationAssets.some(
      (asset) => asset.type === "COVER_LETTER",
    ),
    appliedAt: campaign.appliedAt?.toISOString() ?? null,
  });
  if (campaign.nextStepStateKey === `failed:${state.key}`) return;
  if (
    campaign.nextStepStateKey === state.key &&
    campaign.nextStepText?.trim()
  ) {
    return;
  }
  await enqueueApplicationJob({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: "NEXT_STEP",
  });
}

export async function retryApplicationNextStep(input: {
  organizationId: string;
  campaignId: string;
}) {
  await prisma.campaign.update({
    where: { id: input.campaignId },
    data: {
      nextStepText: null,
      nextStepStateKey: null,
    },
  });
  return enqueueApplicationJob({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: "NEXT_STEP",
  });
}

export function rejectedNextStep(text: string, stateKey: string): boolean {
  const lower = text.toLowerCase();
  if (/\bscheduled?\b/.test(lower)) return true;
  if (stateKey === "consultation_not_started") {
    const coach = consultationConfig.displayName.toLowerCase();
    const starts =
      lower.includes(`start`) ||
      lower.includes("open") ||
      lower.includes("begin");
    if (lower.includes(coach) && starts) return false;
    return true;
  }
  return false;
}

export async function processApplicationNextStep(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const result = await writeStoredApplicationNextStep(input);
  if (result.failed) {
    throw new Error(consultationConversationCopy.nextStepFailed);
  }
}

async function writeStoredApplicationNextStep(input: {
  organizationId: string;
  campaignId: string;
}): Promise<{
  text: string | null;
  stateKey: string;
  failed: boolean;
}> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: {
      appliedAt: true,
      consultationSession: {
        select: { status: true, generationStatus: true },
      },
      presentationPlans: { select: { type: true, status: true } },
      applicationAssets: { select: { type: true } },
    },
  });
  if (!campaign) {
    return { text: null, stateKey: "missing", failed: false };
  }
  const resumePlan = campaign.presentationPlans.find((plan) => plan.type === "RESUME");
  const coverPlan = campaign.presentationPlans.find(
    (plan) => plan.type === "COVER_LETTER",
  );
  const state = applicationNextStepState({
    consultationStatus: campaign.consultationSession?.status ?? null,
    consultationGenerationStatus:
      campaign.consultationSession?.generationStatus ?? null,
    resumePlanStatus: resumePlan?.status ?? null,
    coverPlanStatus: coverPlan?.status ?? null,
    hasResume: campaign.applicationAssets.some((asset) => asset.type === "RESUME"),
    hasCoverLetter: campaign.applicationAssets.some(
      (asset) => asset.type === "COVER_LETTER",
    ),
    appliedAt: campaign.appliedAt?.toISOString() ?? null,
  });
  const written = await writeApplicationNextStep({
    state,
    usage: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      category: "CONSULTATION",
      operation: "APPLICATION_NEXT_STEP",
    },
  });
  if (!written.ok) {
    await prisma.campaign.update({
      where: { id: input.campaignId },
      data: { nextStepText: null, nextStepStateKey: `failed:${state.key}` },
    });
    return { text: null, stateKey: state.key, failed: true };
  }
  await prisma.campaign.update({
    where: { id: input.campaignId },
    data: {
      nextStepText: written.text,
      nextStepStateKey: state.key,
    },
  });
  return { text: written.text, stateKey: state.key, failed: false };
}

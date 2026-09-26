import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import {
  getConsultationAiProvider,
  isConsultationAiConfigured,
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

export async function writeApplicationNextStep(input: {
  state: NextStepState;
}): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  if (!isConsultationAiConfigured()) {
    console.error(
      JSON.stringify({
        event: "application_next_step_failed",
        cause: "CONSULTATION_AI_not_configured",
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
        const response = await getConsultationAiProvider().generateStructured({
          ...structuredOutputRequest("applicationNextStep"),
          messages: [
            {
              role: "system",
              content: `Prompt version: ${NEXT_STEP_PROMPT_VERSION}\n\n${APPLICATION_NEXT_STEP_INSTRUCTIONS}`,
            },
            {
              role: "user",
              content: JSON.stringify({
                consultantName: consultationConfig.displayName,
                state: input.state,
                rejectedPrevious: null,
              }),
            },
          ],
          parseOutput: (raw) => ({
            data: applicationNextStepSchema.parse(raw),
            coercedFields: [],
          }),
        });
        return { ok: true, text: response.data.text };
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

export async function ensureApplicationNextStep(input: {
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
  if (
    campaign.nextStepStateKey === state.key &&
    campaign.nextStepText?.trim()
  ) {
    return { text: campaign.nextStepText, stateKey: state.key, failed: false };
  }
  await enqueueApplicationJob({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: "NEXT_STEP",
  });
  return {
    text: campaign.nextStepText,
    stateKey: state.key,
    failed: false,
  };
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
  const written = await writeApplicationNextStep({ state });
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

export async function retryApplicationNextStep(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  await prisma.campaign.update({
    where: { id: input.campaignId },
    data: {
      nextStepText: null,
      nextStepStateKey: null,
    },
  });
  await enqueueApplicationJob({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: "NEXT_STEP",
  });
}


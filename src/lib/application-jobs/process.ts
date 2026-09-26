import {
  completeApplicationJob,
  failApplicationJob,
  readJobPayload,
} from "@/lib/application-jobs/service";
import type { ApplicationJobResult } from "@/lib/application-jobs/types";
import { processApplicationNextStep } from "@/lib/application/next-step";
import { generateApplicationAsset } from "@/lib/application-assets/service";
import { generateOutreachAsset } from "@/lib/application-assets/outreach";
import { generateApplicationSummary } from "@/lib/application-summary/service";
import { buildContactIndividualProfile } from "@/lib/contact-profile/service";
import {
  rebuildApplicationHiringTeamRole,
  syncApplicationHiringTeam,
} from "@/lib/hiring-team/build";
import { requestInterviewGuide } from "@/lib/interview/guide";
import {
  personPrepFocus,
  recordPersonPrepOpening,
} from "@/lib/interview/person-prep";
import { prisma } from "@/lib/prisma-client";
import { runWithTenantContext } from "@/lib/tenant/request-context";
import {
  answerConsultationQuestion,
  continueConsultationPlanning,
  processConsultationReply,
  replyConsultation,
  reassessConsultationStanding,
  retryConsultationGeneration,
  startConsultation,
} from "@/lib/consultation/service";
import { writePresentationPlan } from "@/lib/application-assets/plan-service";
import type { ApplicationAssetType, EmailLength } from "@prisma/client";

export async function processApplicationJob(
  jobId: string,
): Promise<ApplicationJobResult> {
  const started = Date.now();
  const job = await prisma.applicationJob.findFirst({ where: { id: jobId } });
  if (!job) {
    return {
      ok: false,
      jobId,
      type: "UNKNOWN",
      campaignId: null,
      durationMs: Date.now() - started,
      error: "Application job was not found.",
    };
  }
  const payload = readJobPayload(job.payload);
  try {
    await runWithTenantContext(
      {
        organizationId: job.organizationId,
        userId: job.initiatedByUserId ?? payload.userId ?? null,
      },
      async () => {
        await prisma.applicationJob.update({
          where: { id: job.id },
          data: { workerHeartbeatAt: new Date() },
        });
        switch (job.type) {
          case "HIRING_TEAM_IDENTIFY":
            await syncApplicationHiringTeam({
              organizationId: job.organizationId,
              campaignId: job.campaignId,
            });
            break;
          case "HIRING_TEAM_BUILD":
            if (!job.targetId) throw new Error("Hiring Team build is missing a role.");
            await rebuildApplicationHiringTeamRole({
              organizationId: job.organizationId,
              campaignId: job.campaignId,
              personaId: job.targetId,
            });
            break;
          case "CONTACT_PROFILE":
            if (!job.targetId) throw new Error("Individual profile is missing a contact.");
            await buildContactIndividualProfile({
              organizationId: job.organizationId,
              campaignId: job.campaignId,
              contactId: job.targetId,
            });
            break;
          case "CONSULTATION":
            await processConsultationJob({
              organizationId: job.organizationId,
              campaignId: job.campaignId,
              operation: payload.operation,
              answer: payload.answer,
              targetKey: payload.targetKey,
              contactId: payload.contactId ?? job.targetId,
            });
            break;
          case "RESUME":
          case "COVER_LETTER":
            if (payload.operation === "plan") {
              const planned = await writePresentationPlan({
                organizationId: job.organizationId,
                campaignId: job.campaignId,
                type: job.type,
                adjustmentNote: payload.adjustmentNote ?? null,
              });
              if (!planned.ok) throw new Error(planned.message);
              break;
            }
            {
              const generated = await generateApplicationAsset({
                organizationId: job.organizationId,
                campaignId: job.campaignId,
                userId: payload.userId ?? job.initiatedByUserId ?? "",
                type: job.type,
                hiddenRoleIds: payload.hiddenRoleIds ?? [],
                regenerationInstruction: payload.regenerationInstruction ?? null,
              });
              if (!generated.ok) {
                const detail = [generated.message, ...generated.violations]
                  .map((item) => item.trim())
                  .filter(Boolean);
                throw new Error([...new Set(detail)].join("\n"));
              }
            }
            break;
          case "OUTREACH":
            {
              const generated = await generateOutreachAsset({
              organizationId: job.organizationId,
              campaignId: job.campaignId,
              userId: payload.userId ?? job.initiatedByUserId ?? "",
              type: (payload.assetType ?? "EMAIL") as ApplicationAssetType,
              personaId: payload.personaId ?? job.targetId ?? "",
              contactId: payload.contactId ?? null,
              purpose:
                payload.purpose === "FOLLOW_UP" ||
                payload.purpose === "THANK_YOU" ||
                payload.purpose === "CHECK_IN"
                  ? payload.purpose
                  : "PROACTIVE",
              followUpToAssetId: payload.followUpToAssetId ?? null,
              interviewStageId: payload.interviewStageId ?? null,
              emailLength: (payload.emailLength as EmailLength | null) ?? null,
              regenerationInstruction: payload.regenerationInstruction ?? null,
              skipThankYouQuestions: payload.skipThankYouQuestions,
              thankYouAnswers: payload.thankYouAnswers,
            });
              if (!generated.ok) throw new Error(generated.message);
            }
            break;
          case "INTERVIEW_GUIDE":
            if (!payload.stageId && !job.targetId) {
              throw new Error("Interview guide is missing a stage.");
            }
            {
              const generated = await requestInterviewGuide({
                organizationId: job.organizationId,
                campaignId: job.campaignId,
                userId: payload.userId ?? job.initiatedByUserId ?? "",
                stageId: payload.stageId ?? job.targetId ?? "",
                skipQuestions: Boolean(payload.skipQuestions),
                answers: payload.answers ?? [],
                regenerationInstruction: payload.regenerationInstruction ?? null,
              });
              if (generated.status === "FAILED") throw new Error(generated.message);
            }
            break;
          case "APPLICATION_SUMMARY":
            await generateApplicationSummary({
              organizationId: job.organizationId,
              campaignId: job.campaignId,
              userId: payload.userId ?? job.initiatedByUserId ?? "",
            });
            break;
          case "NEXT_STEP":
            await processApplicationNextStep({
              organizationId: job.organizationId,
              campaignId: job.campaignId,
            });
            break;
          default:
            throw new Error(`Unsupported application job type: ${job.type}`);
        }
      },
    );
    await completeApplicationJob(job.id);
    return {
      ok: true,
      jobId: job.id,
      type: job.type,
      campaignId: job.campaignId,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Application job failed.";
    console.error(
      JSON.stringify({
        event: "application_job_failed",
        jobId: job.id,
        type: job.type,
        campaignId: job.campaignId,
        message,
        cause: error instanceof Error ? error.stack ?? error.message : message,
      }),
    );
    await failApplicationJob({ jobId: job.id, message });
    return {
      ok: false,
      jobId: job.id,
      type: job.type,
      campaignId: job.campaignId,
      durationMs: Date.now() - started,
      error: message,
    };
  }
}

async function processConsultationJob(input: {
  organizationId: string;
  campaignId: string;
  operation?: string;
  answer?: string;
  targetKey?: string;
  contactId?: string | null;
}): Promise<void> {
  if (input.operation === "retry") {
    await retryConsultationGeneration(input);
    return;
  }
  if (input.operation === "reassess") {
    await reassessConsultationStanding({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    });
    return;
  }
  if (input.operation === "continue") {
    await continueConsultationPlanning({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    });
    return;
  }
  if (input.operation === "person_prep") {
    if (!input.contactId) {
      throw new Error("Interviewer prep needs a person.");
    }
    const focus = await personPrepFocus({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
    });
    await startConsultation({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      focusTargetKey: focus.focusTargetKey,
      focusNote: focus.focusNote,
    });
    const session = await prisma.consultationSession.findUnique({
      where: { campaignId: input.campaignId },
      select: { id: true },
    });
    const opening = session
      ? await prisma.consultationTurn.findFirst({
          where: { sessionId: session.id, speaker: "CONSULTANT" },
          orderBy: { sequence: "desc" },
          select: { body: true },
        })
      : null;
    await recordPersonPrepOpening({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
      openingText: opening?.body ?? null,
    });
    return;
  }
  if (input.operation === "process_reply") {
    await processConsultationReply({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      targetKey: input.targetKey,
      answer: input.answer,
    });
    return;
  }
  if (input.operation === "reply") {
    await replyConsultation({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      answer: input.answer ?? "",
    });
    return;
  }
  if (input.operation === "answer") {
    await answerConsultationQuestion({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      targetKey: input.targetKey ?? "",
      answer: input.answer ?? "",
    });
    return;
  }
  await startConsultation(input);
}

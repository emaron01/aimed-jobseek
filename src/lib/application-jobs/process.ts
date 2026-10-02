import {
  completeApplicationJob,
  consultationPlanningOperationsFromPayload,
  enqueueApplicationJob,
  failApplicationJob,
  readJobPayload,
} from "@/lib/application-jobs/service";
import type { ApplicationJobResult } from "@/lib/application-jobs/types";
import { processApplicationNextStep } from "@/lib/application/next-step";
import { generateApplicationAsset } from "@/lib/application-assets/service";
import {
  acceptPresentationPlan,
  writePresentationPlan,
} from "@/lib/application-assets/plan-service";
import { generateOutreachAsset } from "@/lib/application-assets/outreach";
import { enqueuePersonaCheatSheetSection } from "@/lib/application-summary/enqueue";
import { generateApplicationSummary } from "@/lib/application-summary/service";
import { checkOrganizationMaySpend } from "@/lib/billing/organization-spend";
import { buildContactIndividualProfile } from "@/lib/contact-profile/service";
import {
  rebuildApplicationHiringTeamRole,
  syncApplicationHiringTeam,
} from "@/lib/hiring-team/build";
import {
  personPrepFocus,
  recordPersonPrepOpening,
} from "@/lib/interview/person-prep";
import { outreachJobTargetId } from "@/lib/product-config";
import { prisma } from "@/lib/prisma-client";
import { runWithTenantContext } from "@/lib/tenant/request-context";
import { drainConsultationUnprocessedInput } from "@/lib/consultation/drain";
import {
  continueConsultationPlanning,
  reassessConsultationStanding,
  retryConsultationGeneration,
  startConsultation,
} from "@/lib/consultation/service";
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

  const spend = await checkOrganizationMaySpend(job.organizationId);
  if (!spend.allowed) {
    // Terminal FAILED — spend/missing messages are not retryable provider failures.
    await failApplicationJob({ jobId: job.id, message: spend.message });
    return {
      ok: false,
      jobId: job.id,
      type: job.type,
      campaignId: job.campaignId,
      durationMs: Date.now() - started,
      error: spend.message,
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
            {
              const rebuildResult = await rebuildApplicationHiringTeamRole({
                organizationId: job.organizationId,
                campaignId: job.campaignId,
                personaId: job.targetId,
              });
              if (payload.deferCheatSheetSection && job.targetId) {
                await enqueuePersonaCheatSheetSection({
                  organizationId: job.organizationId,
                  campaignId: job.campaignId,
                  personaId: job.targetId,
                  userId: job.initiatedByUserId ?? payload.userId ?? null,
                });
              }
              if (!rebuildResult.synthesizeSkipped) {
                const deferred = payload.deferredOutreach;
                if (deferred?.assetType && deferred.personaId) {
                  const deferredPurpose =
                    deferred.purpose === "FOLLOW_UP" ||
                    deferred.purpose === "THANK_YOU" ||
                    deferred.purpose === "CHECK_IN"
                      ? deferred.purpose
                      : "PROACTIVE";
                  const deferredType = deferred.assetType as
                    | "EMAIL"
                    | "LINKEDIN_CONNECTION_NOTE"
                    | "LINKEDIN_INMAIL";
                  await enqueueApplicationJob({
                    organizationId: job.organizationId,
                    campaignId: job.campaignId,
                    type: "OUTREACH",
                    targetId: outreachJobTargetId({
                      type: deferredType,
                      personaId: deferred.personaId,
                      contactId: deferred.contactId ?? null,
                      purpose: deferredPurpose,
                      interviewStageId: deferred.interviewStageId ?? null,
                    }),
                    initiatedByUserId: job.initiatedByUserId,
                    payload: {
                      userId:
                        deferred.userId ??
                        job.initiatedByUserId ??
                        payload.userId,
                      assetType: deferred.assetType,
                      personaId: deferred.personaId,
                      contactId: deferred.contactId ?? null,
                      purpose: deferred.purpose,
                      followUpToAssetId: deferred.followUpToAssetId ?? null,
                      interviewStageId: deferred.interviewStageId ?? null,
                      emailLength: deferred.emailLength ?? null,
                      regenerationInstruction:
                        deferred.regenerationInstruction ?? null,
                      skipThankYouQuestions: deferred.skipThankYouQuestions,
                      thankYouAnswers: deferred.thankYouAnswers,
                    },
                  });
                }
              }
            }
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
              operations: consultationPlanningOperationsFromPayload(payload),
              contactId: payload.contactId ?? job.targetId,
              gate: payload.gate,
              fingerprint: payload.fingerprint,
            });
            break;
          case "RESUME":
          case "COVER_LETTER":
            if (
              payload.operation === "plan" ||
              payload.operation === "plan_accept_generate"
            ) {
              const planned = await writePresentationPlan({
                organizationId: job.organizationId,
                campaignId: job.campaignId,
                type: job.type,
                adjustmentNote: payload.adjustmentNote ?? null,
              });
              if (!planned.ok) throw new Error(planned.message);
              if (payload.operation === "plan") break;
              await acceptPresentationPlan({
                organizationId: job.organizationId,
                campaignId: job.campaignId,
                type: job.type,
              });
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
              const personaId = (payload.personaId ?? "").trim();
              if (!personaId) {
                throw new Error("Outreach is missing a Hiring Team role.");
              }
              const generated = await generateOutreachAsset({
              organizationId: job.organizationId,
              campaignId: job.campaignId,
              userId: payload.userId ?? job.initiatedByUserId ?? "",
              type: (payload.assetType ?? "EMAIL") as ApplicationAssetType,
              personaId,
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
            // Guide generation was removed; complete orphan jobs with no paid call.
            break;
          case "APPLICATION_SUMMARY":
            await generateApplicationSummary({
              organizationId: job.organizationId,
              campaignId: job.campaignId,
              userId: payload.userId ?? job.initiatedByUserId ?? "",
              sectionKey: payload.sectionKey,
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
    if (job.type !== "NEXT_STEP") {
      const { queueApplicationNextStepIfNeeded } = await import(
        "@/lib/application/next-step"
      );
      await queueApplicationNextStepIfNeeded({
        organizationId: job.organizationId,
        campaignId: job.campaignId,
      });
    }
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
    const failed = await prisma.applicationJob.findFirst({
      where: { id: job.id },
      select: { status: true, targetId: true },
    });
    if (
      job.type === "HIRING_TEAM_BUILD" &&
      failed?.status === "FAILED" &&
      (failed.targetId || job.targetId)
    ) {
      const { markHiringTeamBuildTemporaryExhausted } = await import(
        "@/lib/hiring-team/build"
      );
      await markHiringTeamBuildTemporaryExhausted({
        organizationId: job.organizationId,
        campaignId: job.campaignId,
        personaId: failed.targetId ?? job.targetId!,
        message,
      });
    }
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
  operations: string[];
  contactId?: string | null;
  gate?: string;
  fingerprint?: string;
}): Promise<void> {
  // Answers first: incomplete SEEKER turns from the DB (DECISION 1).
  await drainConsultationUnprocessedInput({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
  });

  // Then planning ops in request order (duplicates already collapsed on merge).
  for (const operation of input.operations) {
    if (operation === "retry") {
      await retryConsultationGeneration(input);
      continue;
    }
    if (operation === "reassess") {
      if (input.gate === "seeker_background") {
        const { seekerBackgroundReassessFingerprintChanged } = await import(
          "@/lib/consultation/seeker-background-reassess"
        );
        const { seekerBackgroundText } = await import(
          "@/lib/product-research/seeker-background"
        );
        const { parseCandidateProfileSafe } = await import(
          "@/lib/product-research/candidate-profile"
        );
        const campaign = await prisma.campaign.findFirst({
          where: {
            id: input.campaignId,
            organizationId: input.organizationId,
          },
          select: { product: { select: { profileJson: true } } },
        });
        const parsed = campaign?.product.profileJson
          ? parseCandidateProfileSafe(campaign.product.profileJson)
          : null;
        const text =
          parsed?.ok === true ? seekerBackgroundText(parsed.profile) : "";
        const { changed, fingerprint } =
          await seekerBackgroundReassessFingerprintChanged({
            organizationId: input.organizationId,
            campaignId: input.campaignId,
            text,
          });
        // Worker second line: unchanged background → no paid reassess.
        if (!changed) continue;
        await reassessConsultationStanding({
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          seekerBackgroundFingerprint: input.fingerprint ?? fingerprint,
        });
        continue;
      }
      await reassessConsultationStanding({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
      });
      continue;
    }
    if (operation === "continue") {
      await continueConsultationPlanning({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
      });
      continue;
    }
    if (operation === "person_prep") {
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
        interviewerPrep: focus.interviewerPrep,
      });
      const session = await prisma.consultationSession.findUnique({
        where: { campaignId: input.campaignId },
        select: { coachNote: true },
      });
      await recordPersonPrepOpening({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        contactId: input.contactId,
        openingText: session?.coachNote ?? null,
      });
      continue;
    }
    if (operation === "start") {
      await startConsultation({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
      });
    }
  }
}

import {
  completeConsultationAction,
  pauseConsultationAction,
  resumeConsultationAction,
  retryConsultationAction,
  skipConsultationAction,
  startConsultationAction,
} from "@/app/actions/consultation";
import { AppPendingIndicator } from "@/components/AppButton";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import {
  WorkspaceJobRefresh,
  WorkspaceProgress,
} from "@/components/ApplicationWorkspaceLive";
import {
  enqueueApplicationJob,
  readJobPayload,
} from "@/lib/application-jobs/service";
import {
  buildConsultationQaView,
  consultationHasUnansweredQuestions,
  latestClosingNote,
} from "@/lib/consultation/qa-view";
import {
  consultationItemNeedsResultRepair,
  shouldEnqueueConsultationResultRepair,
} from "@/lib/consultation/results";
import { repairExistingConsultationSession } from "@/lib/consultation/repair-existing";
import {
  briefingNeedsStandingRegen,
  buildStandingGaps,
  shouldEnqueueConsultationStandingRegen,
  standingWorkIsComplete,
} from "@/lib/consultation/standing";
import { seekerFirstName } from "@/lib/consultation/voice";
import { listPersonPreps } from "@/lib/interview/person-prep";
import { ConsultationKnowAboutMe } from "@/components/ConsultationKnowAboutMe";
import { ConsultationStanding } from "@/components/ConsultationStanding";
import { ConsultationThread } from "@/components/ConsultationThread";
import type { WorkspaceJobStatusView } from "@/lib/application-jobs/workspace-status";
import { OpenWorkspaceHashSection } from "@/components/OpenWorkspaceHashSection";
import {
  WORKSPACE_CARD_WRAP_CLASS,
  WORKSPACE_MESSAGE_WRAP_CLASS,
} from "@/lib/application/workspace-links";
import {
  CONSULTATION_PROMPT_VERSION,
  consultationBriefingSchema,
} from "@/lib/consultation/contract";
import {
  isStandingRequirement,
  profileEvidenceItems,
} from "@/lib/consultation/assess";
import {
  resolveEvidenceLabels,
} from "@/lib/consultation/evidence-display";
import { prisma } from "@/lib/prisma";
import {
  consultationConfig,
  consultationConversationCopy,
  interviewConfig,
  isObsoleteWorkspaceFailure,
  vocab,
  workspaceJobCopy,
  workspaceSectionId,
} from "@/lib/product-config";
import {
  emptyCandidateProfile,
  parseCandidateProfileSafe,
} from "@/lib/product-research/candidate-profile";
import { seekerBackgroundText } from "@/lib/product-research/seeker-background";
import { parseStringArray } from "@/lib/research";

function experienceCalculation(value: unknown): {
  requiredYears: number;
  totalMonths: number;
  totalYears: number;
  maximumMonths: number;
  maximumYears: number;
  missingDateRoleIds: string[];
  periods: Array<{ roleId: string; startDate: string; endDate: string }>;
} | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.requiredYears !== "number" ||
    typeof row.totalMonths !== "number" ||
    typeof row.totalYears !== "number"
  ) {
    return null;
  }
  const periods = Array.isArray(row.periods)
    ? row.periods.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const period = entry as Record<string, unknown>;
        if (
          typeof period.roleId !== "string" ||
          typeof period.startDate !== "string" ||
          typeof period.endDate !== "string"
        ) {
          return [];
        }
        return [{
          roleId: period.roleId,
          startDate: period.startDate,
          endDate: period.endDate,
        }];
      })
    : [];
  return {
    requiredYears: row.requiredYears,
    totalMonths: row.totalMonths,
    totalYears: row.totalYears,
    maximumMonths:
      typeof row.maximumMonths === "number" ? row.maximumMonths : row.totalMonths,
    maximumYears:
      typeof row.maximumYears === "number" ? row.maximumYears : row.totalYears,
    missingDateRoleIds: parseStringArray(row.missingDateRoleIds),
    periods,
  };
}

function formatExperienceRange(calculation: {
  requiredYears: number;
  totalMonths: number;
  totalYears: number;
  maximumMonths: number;
  maximumYears: number;
  missingDateRoleIds: string[];
  periods: Array<{ roleId: string; startDate: string; endDate: string }>;
  roleLabels: Array<{ id: string; label: string }>;
}): string {
  const years =
    calculation.maximumYears === calculation.totalYears
      ? `${calculation.totalYears} years`
      : `${calculation.totalYears}–${calculation.maximumYears} years`;
  const months =
    calculation.maximumMonths === calculation.totalMonths
      ? `${calculation.totalMonths} months`
      : `${calculation.totalMonths}–${calculation.maximumMonths} months`;
  const labelById = new Map(calculation.roleLabels.map((entry) => [entry.id, entry]));
  const across =
    calculation.periods.length > 0
      ? ` across ${calculation.periods
          .map((period) => {
            const label = labelById.get(period.roleId)?.label;
            return label
              ? `${label}: ${period.startDate}–${period.endDate}`
              : `${period.startDate}–${period.endDate}`;
          })
          .join("; ")}`
      : "";
  const missing =
    calculation.missingDateRoleIds.length > 0
      ? ` Dates needed for ${calculation.missingDateRoleIds
          .map((id) => labelById.get(id)?.label)
          .filter(Boolean)
          .join(", ")}.`
      : "";
  return `Verified experience: ${years} (${months}) toward ${calculation.requiredYears} years${across}.${missing}`;
}

export async function ConsultationSection({
  campaignId,
  organizationId,
  canEdit,
  jobs = [],
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
  jobs?: WorkspaceJobStatusView[];
}) {
  if (canEdit) {
    await repairExistingConsultationSession({ organizationId, campaignId });
  }
  const [session, campaign] = await Promise.all([
    prisma.consultationSession.findFirst({
      where: { campaignId, organizationId },
      include: {
        assessments: { orderBy: { targetKey: "asc" } },
        turns: { orderBy: { sequence: "asc" } },
        statements: { orderBy: [{ turnId: "asc" }, { kind: "asc" }] },
      },
    }),
    prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
      select: { product: { select: { profileJson: true } } },
    }),
  ]);
  const parsed = campaign?.product.profileJson
    ? parseCandidateProfileSafe(campaign.product.profileJson)
    : { ok: true as const, profile: emptyCandidateProfile() };
  const firstName = parsed.ok
    ? seekerFirstName(parsed.profile.identity.name?.text)
    : null;
  const profileItems = parsed.ok ? profileEvidenceItems(parsed.profile) : [];
  const personPreps = await listPersonPreps({ organizationId, campaignId });
  const briefing = session
    ? consultationBriefingSchema.safeParse(session.briefingJson)
    : null;
  const failed =
    session?.generationStatus === "FAILED" &&
    !isObsoleteWorkspaceFailure(session.generationError);
  const qualityNote =
    session?.generationStatus === "GENERATING"
      ? null
      : (session?.generationError?.trim() &&
          !isObsoleteWorkspaceFailure(session.generationError)
          ? session.generationError.trim()
          : null) ||
        (failed ? consultationConversationCopy.generationFailed : null);
  const statements = session?.statements ?? [];
  const consultationBusy = jobs.some(
    (job) =>
      job.type === "CONSULTATION" &&
      (job.status === "PENDING" || job.status === "IN_PROGRESS"),
  );
  const standingRequirements =
    session?.assessments
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
      .map((item) => {
      const facts = resolveEvidenceLabels(
        parseStringArray(item.supportingFactIds),
        profileItems,
      );
      const calculation = experienceCalculation(item.experienceCalculationJson);
      const roleLabels = calculation
        ? resolveEvidenceLabels(
            [
              ...calculation.periods.map((period) => period.roleId),
              ...calculation.missingDateRoleIds,
            ],
            profileItems,
          )
        : [];
      return {
        id: item.id,
        text: item.text,
        strength: item.strength,
        explanation: item.explanation,
        facts: facts.map((fact) => ({
          id: fact.id,
          label: fact.label,
          detail: fact.detail,
        })),
        experience: calculation
          ? formatExperienceRange({ ...calculation, roleLabels })
          : null,
      };
    }) ?? [];
  const hasStanding =
    briefing?.success || standingRequirements.length > 0;
  const threadTurns =
    session?.turns.map((turn) => ({
      id: turn.id,
      speaker: turn.speaker,
      body: turn.body,
      targetKey: turn.targetKey,
      followUp: turn.followUp,
      sequence: turn.sequence,
      analysisJson: turn.analysisJson,
      intent: turn.intent,
    })) ?? [];
  const threadStatements = statements.map((statement) => ({
    id: statement.id,
    turnId: statement.turnId,
    kind: statement.kind,
    status: statement.status,
    content: statement.content,
    strengtheningNote: statement.strengtheningNote,
    createdAt: statement.createdAt,
  }));
  const qaView = buildConsultationQaView({
    turns: threadTurns,
    statements: threadStatements,
  });
  const latestSeekerAnswerAt =
    session?.turns
      .filter((turn) => turn.speaker === "SEEKER" && !turn.skipped)
      .reduce<Date | null>((latest, turn) => {
        const at = turn.createdAt;
        if (!latest || at > latest) return at;
        return latest;
      }, null) ?? null;
  const recentConsultationJobs = canEdit
    ? await prisma.applicationJob.findMany({
        where: {
          organizationId,
          campaignId,
          type: "CONSULTATION",
          status: { in: ["COMPLETED", "FAILED"] },
        },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { createdAt: true, completedAt: true, payload: true, status: true },
      })
    : [];
  const lastRepairJob = recentConsultationJobs.find(
    (job) => readJobPayload(job.payload).operation === "repair_results",
  );
  const lastRepairAttemptAt = lastRepairJob
    ? lastRepairJob.completedAt ?? lastRepairJob.createdAt
    : null;
  if (
    shouldEnqueueConsultationResultRepair({
      needsRepair:
        canEdit && qaView.questions.some(consultationItemNeedsResultRepair),
      busy: consultationBusy,
      latestSeekerAnswerAt,
      lastRepairAttemptAt,
      lastRepairSucceeded: lastRepairJob?.status === "COMPLETED",
      stalePromptVersion: qaView.questions.some((item) => {
        if (!consultationItemNeedsResultRepair(item)) return false;
        const versions = [item.talkingPoint, item.resumeBullet]
          .map((statement) =>
            statement
              ? statements.find((row) => row.id === statement.id)?.promptVersion
              : null,
          )
          .filter((version): version is string => Boolean(version));
        if (versions.length < 2) return true;
        return versions.some(
          (version) => version !== CONSULTATION_PROMPT_VERSION,
        );
      }),
    })
  ) {
    await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "CONSULTATION",
      payload: { operation: "repair_results" },
    });
  }
  const lastReassessJob = recentConsultationJobs.find(
    (job) => readJobPayload(job.payload).operation === "reassess",
  );
  const briefingTexts = briefing?.success
    ? [
        briefing.data.overall,
        ...briefing.data.strongestAngles,
        ...briefing.data.importantGaps,
        ...briefing.data.storyPlan,
        ...(session?.assessments.map((item) => item.explanation ?? "") ?? []),
      ]
    : session?.assessments.map((item) => item.explanation ?? "") ?? [];
  if (
    shouldEnqueueConsultationStandingRegen({
      needsRegen:
        canEdit &&
        Boolean(session) &&
        briefingNeedsStandingRegen({
          texts: briefingTexts,
          firstName,
          promptVersion: session?.promptVersion,
          currentPromptVersion: CONSULTATION_PROMPT_VERSION,
        }),
      busy: consultationBusy,
      lastReassessAttemptAt: lastReassessJob
        ? lastReassessJob.completedAt ?? lastReassessJob.createdAt
        : null,
      lastReassessSucceeded: lastReassessJob?.status === "COMPLETED",
      stalePromptVersion: session?.promptVersion !== CONSULTATION_PROMPT_VERSION,
    })
  ) {
    await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "CONSULTATION",
      payload: { operation: "reassess" },
    });
  }
  const unanswered = consultationHasUnansweredQuestions(qaView);
  const standingGaps = session
    ? buildStandingGaps({
        assessments: session.assessments
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
          .map((item) => ({
            key: item.targetKey,
            kind: item.kind as
              | "REQUIRED"
              | "OUTCOME"
              | "COMPETENCY"
              | "MISSION"
              | "PREFERRED",
            text: item.text,
            strength: item.strength,
          })),
        questions: qaView.questions,
      })
    : [];
  const standingComplete = standingWorkIsComplete({
    gaps: standingGaps,
    unansweredQuestions: unanswered,
  });
  const threadStatus =
    session &&
    (session.status === "DONE" || session.status === "SKIPPED") &&
    !standingComplete
      ? "IN_PROGRESS"
      : session?.status ?? "";
  const closingNote = standingComplete
    ? latestClosingNote(threadTurns)
    : null;

  return (
    <>
      <OpenWorkspaceHashSection sectionId={workspaceSectionId("CONSULTATION")} />
      <section
        id={workspaceSectionId("CONSULTATION")}
        className={`space-y-4 rounded-lg border border-edge bg-surface p-5 ${WORKSPACE_CARD_WRAP_CLASS}`}
        data-testid="consultation"
      >
        <h2 className="text-base font-semibold text-ink">
          {consultationConfig.displayName}
        </h2>
        <p className={`text-sm text-muted ${WORKSPACE_MESSAGE_WRAP_CLASS}`}>
          {consultationConfig.displayName} compares this job with the{" "}
          {vocab.product.singular} and draws out the stories behind the gaps.
          Nothing is added to the {vocab.product.singular} until you confirm it.
        </p>
        {canEdit ? (
          <ConsultationKnowAboutMe
            campaignId={campaignId}
            initialText={parsed.ok ? seekerBackgroundText(parsed.profile) : ""}
          />
        ) : null}
        <WorkspaceJobRefresh campaignId={campaignId} />
        <WorkspaceProgress jobs={jobs} type="CONSULTATION" stayAndWatch />
        {consultationBusy ? (
          <p className="text-sm text-muted" data-testid="harper-typing">
            <AppPendingIndicator label={workspaceJobCopy.typing} />
          </p>
        ) : null}
        {personPreps.length > 0 ? (
          <div className="space-y-3" data-testid="person-prep-offers">
            {personPreps.map((prep) => (
              <article
                key={prep.contactId}
                className="rounded-md border border-edge bg-canvas p-4"
              >
                <h4 className="text-sm font-semibold text-ink">
                  {interviewConfig.labels.personPrepOffer}: {prep.name || prep.roleName}
                </h4>
                {prep.openingText ? (
                  <p className="mt-2 text-sm text-ink">{prep.openingText}</p>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    <AppPendingIndicator label={workspaceJobCopy.typing} />
                  </p>
                )}
                {prep.confirmedAnswers.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
                    {prep.confirmedAnswers.map((answer) => (
                      <li key={answer.turnId}>{answer.text}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
        {qualityNote ? (
          <div
            className={`space-y-2 rounded-md border border-warning bg-warning-tint p-3 ${WORKSPACE_CARD_WRAP_CLASS}`}
            data-testid="consultation-failed"
          >
            <p className={`text-sm text-warning ${WORKSPACE_MESSAGE_WRAP_CLASS}`}>
              {qualityNote}
            </p>
            {canEdit ? (
              <ApplicationActionForm
                action={retryConsultationAction}
                submitLabel={consultationConversationCopy.retry}
                testId="retry-consultation"
              >
                <input type="hidden" name="campaignId" value={campaignId} />
              </ApplicationActionForm>
            ) : null}
          </div>
        ) : null}
        {threadStatus === "SKIPPED" ? (
          <p className="text-sm text-ink">
            Consultation is skipped. Materials can still be generated from the{" "}
            {vocab.product.singular} alone.
          </p>
        ) : null}
        {threadStatus === "PAUSED" ? (
          <p className="text-sm text-ink">Paused. Resume when you want to continue.</p>
        ) : null}
        {standingComplete && (closingNote || threadStatus === "DONE") ? (
          <p className="text-sm text-ink" data-testid="consultation-complete">
            {closingNote || consultationConversationCopy.planComplete}
          </p>
        ) : null}
        {canEdit && !session && !consultationBusy ? (
          <div className="flex flex-wrap gap-3">
            <ApplicationActionForm
              action={startConsultationAction}
              submitLabel={consultationConversationCopy.start}
              testId="start-consultation"
            >
              <input type="hidden" name="campaignId" value={campaignId} />
            </ApplicationActionForm>
            <ApplicationActionForm
              action={skipConsultationAction}
              submitLabel="Skip consultation"
              testId="skip-consultation"
            >
              <input type="hidden" name="campaignId" value={campaignId} />
            </ApplicationActionForm>
          </div>
        ) : null}
        {session && !failed ? (
          <ConsultationThread
            campaignId={campaignId}
            canEdit={canEdit}
            sessionStatus={threadStatus}
            jobsActive={consultationBusy}
            turns={threadTurns}
            statements={threadStatements}
          />
        ) : null}
        {canEdit && session?.status === "IN_PROGRESS" && !failed ? (
          <div className="flex flex-wrap gap-3">
            <ApplicationActionForm
              action={pauseConsultationAction}
              submitLabel="Pause"
              testId="pause-consultation"
            >
              <input type="hidden" name="campaignId" value={campaignId} />
            </ApplicationActionForm>
            <ApplicationActionForm
              action={completeConsultationAction}
              submitLabel="Done"
              testId="done-consultation"
            >
              <input type="hidden" name="campaignId" value={campaignId} />
            </ApplicationActionForm>
            <ApplicationActionForm
              action={skipConsultationAction}
              submitLabel="Skip the rest"
              testId="skip-consultation-open"
            >
              <input type="hidden" name="campaignId" value={campaignId} />
            </ApplicationActionForm>
          </div>
        ) : null}
        {canEdit && (threadStatus === "PAUSED" || threadStatus === "SKIPPED") ? (
          <ApplicationActionForm
            action={resumeConsultationAction}
            submitLabel="Resume"
            testId="resume-consultation"
          >
            <input type="hidden" name="campaignId" value={campaignId} />
          </ApplicationActionForm>
        ) : null}
        {hasStanding ? (
          <details
            className="rounded-md border border-edge bg-canvas p-4"
            data-testid="consultation-standing-panel"
          >
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              {consultationConversationCopy.whereYouStand}
            </summary>
            <div className="mt-4 space-y-4">
              {briefing?.success ? (
                <div className="space-y-2" data-testid="consultation-briefing">
                  <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
                    {briefing.data.strongestAngles.map((item) => (
                      <li key={item}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {session && standingRequirements.length > 0 ? (
                <ConsultationStanding
                  campaignId={campaignId}
                  canEdit={canEdit}
                  acceptingReplies={
                    threadStatus !== "SKIPPED" &&
                    threadStatus !== "PAUSED" &&
                    !consultationBusy
                  }
                  overall={briefing?.success ? briefing.data.overall : null}
                  gaps={standingGaps.map((gap) => {
                    const item = qaView.questions.find(
                      (question) => question.targetKey === gap.targetKey,
                    );
                    return {
                      ...gap,
                      questionTurnId: item?.questionTurnId ?? null,
                      resumeBullet: item?.resumeBullet ?? null,
                      talkingPoint: item?.talkingPoint ?? null,
                      statements: item?.statements ?? [],
                    };
                  })}
                  careerRecap={null}
                  requirements={standingRequirements}
                />
              ) : (
                <p className="text-sm text-muted">
                  Evidence has not been assessed yet.
                </p>
              )}
            </div>
          </details>
        ) : null}
      </section>
    </>
  );
}

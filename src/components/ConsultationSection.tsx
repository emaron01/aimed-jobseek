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
  buildConsultationQaView,
  consultationHasUnansweredQuestions,
  latestClosingNote,
  latestCoachingNoteForTarget,
} from "@/lib/consultation/qa-view";
import {
  buildStandingGaps,
  qaItemForTargetKey,
  standingGapStatus,
  standingWorkIsComplete,
} from "@/lib/consultation/standing";
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
  consultationBriefingSchema,
} from "@/lib/consultation/contract";
import {
  isStandingRequirement,
  profileEvidenceItems,
} from "@/lib/consultation/assess";
import {
  resolveEvidenceLabels,
  stripInternalIdsFromDisplayText,
} from "@/lib/consultation/evidence-display";
import { formatExperienceLine } from "@/lib/consultation/experience-display";
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
      const roleIds = calculation
        ? [
            ...calculation.periods.map((period) => period.roleId),
            ...calculation.missingDateRoleIds,
          ]
        : [];
      const roles = roleIds.flatMap((id) => {
        const profileItem = profileItems.find((entry) => entry.id === id);
        if (!profileItem) return [];
        return [
          {
            id: profileItem.id,
            employer: profileItem.employer ?? null,
            title: profileItem.title ?? null,
            label:
              profileItem.title?.trim() ||
              profileItem.employer?.trim() ||
              profileItem.text.trim(),
          },
        ];
      });
      const qaItem = qaItemForTargetKey(qaView.questions, item.targetKey);
      const worked = Boolean(
        qaItem &&
          (qaItem.seekerAnswers.length > 0 ||
            qaItem.talkingPoint ||
            qaItem.resumeBullet),
      );
      return {
        id: item.id,
        text: item.text,
        strength: item.strength as "STRONG" | "PARTIAL" | "NONE",
        explanation: item.explanation
          ? stripInternalIdsFromDisplayText(item.explanation)
          : item.explanation,
        gapStatus: worked ? standingGapStatus(qaItem).status : null,
        facts: facts.map((fact) => ({
          id: fact.id,
          label: fact.label,
          detail: fact.detail,
        })),
        experience: calculation
          ? formatExperienceLine({
              totalYears: calculation.totalYears,
              periods: calculation.periods,
              missingDateRoleIds: calculation.missingDateRoleIds,
              roles,
            })
          : null,
      };
    }) ?? [];
  const hasStanding =
    briefing?.success || standingRequirements.length > 0;
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
        <p
          className={`text-sm text-muted ${WORKSPACE_MESSAGE_WRAP_CLASS}`}
          data-testid="harper-coaching-disclaimer"
        >
          {consultationConversationCopy.coachingDisclaimer}
        </p>
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
        {standingComplete && closingNote ? (
          <p className="text-sm text-ink" data-testid="consultation-complete">
            {stripInternalIdsFromDisplayText(closingNote)}
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
                        {stripInternalIdsFromDisplayText(item)}
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
                  overall={
                    briefing?.success
                      ? stripInternalIdsFromDisplayText(briefing.data.overall)
                      : null
                  }
                  gaps={standingGaps.map((gap) => {
                    const item = qaItemForTargetKey(
                      qaView.questions,
                      gap.targetKey,
                    );
                    const harperNote = latestCoachingNoteForTarget(
                      threadTurns,
                      gap.targetKey,
                    );
                    return {
                      ...gap,
                      talkTrack: gap.talkTrack
                        ? stripInternalIdsFromDisplayText(gap.talkTrack)
                        : null,
                      harperNote: harperNote
                        ? stripInternalIdsFromDisplayText(harperNote)
                        : null,
                      questionTurnId: item?.questionTurnId ?? null,
                      resumeBullet: item?.resumeBullet
                        ? {
                            ...item.resumeBullet,
                            content: stripInternalIdsFromDisplayText(
                              item.resumeBullet.content,
                            ),
                            strengtheningNote: item.resumeBullet
                              .strengtheningNote
                              ? stripInternalIdsFromDisplayText(
                                  item.resumeBullet.strengtheningNote,
                                )
                              : null,
                          }
                        : null,
                      talkingPoint: item?.talkingPoint
                        ? {
                            ...item.talkingPoint,
                            content: stripInternalIdsFromDisplayText(
                              item.talkingPoint.content,
                            ),
                            strengtheningNote: item.talkingPoint
                              .strengtheningNote
                              ? stripInternalIdsFromDisplayText(
                                  item.talkingPoint.strengtheningNote,
                                )
                              : null,
                          }
                        : null,
                      statements: (item?.statements ?? []).map((statement) => ({
                        ...statement,
                        content: stripInternalIdsFromDisplayText(
                          statement.content,
                        ),
                        strengtheningNote: statement.strengtheningNote
                          ? stripInternalIdsFromDisplayText(
                              statement.strengtheningNote,
                            )
                          : null,
                      })),
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

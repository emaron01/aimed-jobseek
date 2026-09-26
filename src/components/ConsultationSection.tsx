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
import { WorkspaceProgress } from "@/components/ApplicationWorkspaceLive";
import { listPersonPreps } from "@/lib/interview/person-prep";
import { ConsultationStanding } from "@/components/ConsultationStanding";
import { ConsultationThread } from "@/components/ConsultationThread";
import type { WorkspaceJobStatusView } from "@/lib/application-jobs/workspace-status";
import { OpenWorkspaceHashSection } from "@/components/OpenWorkspaceHashSection";
import {
  WORKSPACE_CARD_WRAP_CLASS,
  WORKSPACE_MESSAGE_WRAP_CLASS,
} from "@/lib/application/workspace-links";
import { consultationBriefingSchema } from "@/lib/consultation/contract";
import {
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
  const standingRequirements =
    session?.assessments.map((item) => {
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
    briefing?.success || (session != null && session.assessments.length > 0);

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
        <WorkspaceProgress jobs={jobs} type="CONSULTATION" stayAndWatch />
        {consultationBusy || session?.generationStatus === "GENERATING" ? (
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
        {session?.status === "SKIPPED" ? (
          <p className="text-sm text-ink">
            Consultation is skipped. Materials can still be generated from the{" "}
            {vocab.product.singular} alone.
          </p>
        ) : null}
        {session?.status === "PAUSED" ? (
          <p className="text-sm text-ink">Paused. Resume when you want to continue.</p>
        ) : null}
        {session?.status === "DONE" ? (
          <p className="text-sm text-ink">{consultationConversationCopy.planComplete}</p>
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
            sessionStatus={session.status}
            jobsActive={consultationBusy}
            generating={session.generationStatus === "GENERATING"}
            turns={session.turns.map((turn) => ({
              id: turn.id,
              speaker: turn.speaker,
              body: turn.body,
              targetKey: turn.targetKey,
              followUp: turn.followUp,
              sequence: turn.sequence,
            }))}
            statements={statements.map((statement) => ({
              id: statement.id,
              turnId: statement.turnId,
              kind: statement.kind,
              status: statement.status,
              content: statement.content,
              strengtheningNote: statement.strengtheningNote,
            }))}
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
        {canEdit && (session?.status === "PAUSED" || session?.status === "SKIPPED") ? (
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
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
                    {briefing.data.storyPlan.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {session && session.assessments.length > 0 ? (
                <ConsultationStanding
                  overall={briefing?.success ? briefing.data.overall : null}
                  gaps={briefing?.success ? briefing.data.importantGaps : []}
                  careerRecap={
                    parsed.ok
                      ? parsed.profile.positioning?.text?.trim() ||
                        parsed.profile.identity.headline?.text?.trim() ||
                        null
                      : null
                  }
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

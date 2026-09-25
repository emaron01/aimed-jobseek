import {
  completeConsultationAction,
  flagConsultationInaccuracyAction,
  pauseConsultationAction,
  replyConsultationAction,
  resumeConsultationAction,
  retryConsultationAction,
  reviseConsultationResultAction,
  skipConsultationAction,
  startConsultationAction,
  useConsultationResultAction,
} from "@/app/actions/consultation";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { WorkspaceProgress } from "@/components/ApplicationWorkspaceLive";
import type { WorkspaceJobStatusView } from "@/lib/application-jobs/workspace-status";
import { workspaceJobCopy } from "@/lib/product-config";
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
  consultationStatementLabels,
  evidenceStrengthLabels,
  vocab,
} from "@/lib/product-config";
import {
  emptyCandidateProfile,
  parseCandidateProfileSafe,
} from "@/lib/product-research/candidate-profile";
import { parseStringArray } from "@/lib/research";

const fieldClass = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

function experienceCalculation(value: unknown): {
  requiredYears: number;
  totalMonths: number;
  totalYears: number;
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
    missingDateRoleIds: parseStringArray(row.missingDateRoleIds),
    periods,
  };
}

export async function ConsultationSection({
  campaignId,
  organizationId,
  canEdit,
  defaultOpen = true,
  jobs = [],
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
  defaultOpen?: boolean;
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
  const briefing = session
    ? consultationBriefingSchema.safeParse(session.briefingJson)
    : null;
  const failed = session?.generationStatus === "FAILED";
  const qualityNote =
    session?.generationStatus === "GENERATING"
      ? null
      : session?.generationError?.trim() ||
        (failed ? consultationConversationCopy.generationFailed : null);
  const draftStatements = (session?.statements ?? []).filter(
    (statement) => statement.status === "DRAFT",
  );
  const statements = session?.statements ?? [];
  const statementsByTurn = new Map<string, typeof statements>();
  for (const statement of statements) {
    const existing = statementsByTurn.get(statement.turnId) ?? [];
    existing.push(statement);
    statementsByTurn.set(statement.turnId, existing);
  }
  const latestDraftTurnId = draftStatements.at(-1)?.turnId ?? null;

  return (
    <details
      open={defaultOpen}
      id="consultation"
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
      data-testid="consultation"
    >
      <summary className="cursor-pointer text-base font-semibold text-slate-900">
        Consultation with {consultationConfig.displayName}
      </summary>
      <div className="mt-4 space-y-4">
      <WorkspaceProgress jobs={jobs} type="CONSULTATION" stayAndWatch />
      {jobs.some(
        (job) =>
          job.type === "CONSULTATION" &&
          (job.status === "PENDING" || job.status === "IN_PROGRESS"),
      ) || session?.generationStatus === "GENERATING" ? (
        <p className="text-sm text-slate-600" data-testid="harper-typing">
          {workspaceJobCopy.typing}
        </p>
      ) : null}
      <p className="text-sm text-slate-600">
        {consultationConfig.displayName} compares this job with the {vocab.product.singular} and draws out the stories behind the gaps. Nothing is added to the {vocab.product.singular} until you confirm it.
      </p>

      {briefing?.success ? (
        <div
          className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-4"
          data-testid="consultation-briefing"
        >
          <p className="text-sm text-slate-900">{briefing.data.overall}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
            {briefing.data.strongestAngles.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
            {briefing.data.importantGaps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-800">
            {briefing.data.storyPlan.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {session && session.assessments.length > 0 ? (
        <details data-testid="consultation-evidence">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">
            {consultationConversationCopy.whereYouStand}
          </summary>
          <ul className="mt-3 space-y-3">
            {session.assessments.map((item) => {
              const facts = resolveEvidenceLabels(
                parseStringArray(item.supportingFactIds),
                profileItems,
              );
              const calculation = experienceCalculation(
                item.experienceCalculationJson,
              );
              const roleLabels = calculation
                ? resolveEvidenceLabels(
                    [
                      ...calculation.periods.map((period) => period.roleId),
                      ...calculation.missingDateRoleIds,
                    ],
                    profileItems,
                  )
                : [];
              const labelById = new Map(roleLabels.map((entry) => [entry.id, entry]));
              return (
                <li key={item.id} className="space-y-1 text-sm text-slate-800">
                  <div>
                    <span className="font-medium">{item.text}</span>
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-800">
                      {evidenceStrengthLabels[item.strength]}
                    </span>
                  </div>
                  {item.explanation ? <p>{item.explanation}</p> : null}
                  {facts.length > 0 ? (
                    <ul className="space-y-1">
                      {facts.map((fact) => (
                        <li key={fact.id}>
                          <details>
                            <summary className="cursor-pointer text-slate-700">
                              {fact.label}
                            </summary>
                            <p className="mt-1 text-slate-600">{fact.detail}</p>
                          </details>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {calculation ? (
                    <p className="text-xs text-slate-500">
                      Verified experience: {calculation.totalYears} years
                      ({calculation.totalMonths} months) toward {calculation.requiredYears}
                      years
                      {calculation.periods.length > 0
                        ? ` across ${calculation.periods
                            .map((period) => {
                              const label = labelById.get(period.roleId)?.label;
                              return label
                                ? `${label}: ${period.startDate}–${period.endDate}`
                                : `${period.startDate}–${period.endDate}`;
                            })
                            .join("; ")}`
                        : ""}
                      {calculation.missingDateRoleIds.length > 0
                        ? `. Dates needed for ${calculation.missingDateRoleIds
                            .map((id) => labelById.get(id)?.label)
                            .filter(Boolean)
                            .join(", ")}.`
                        : "."}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : (
        <p className="text-sm text-slate-600">Evidence has not been assessed yet.</p>
      )}

      {qualityNote ? (
        <div
          className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3"
          data-testid="consultation-failed"
        >
          <p className="text-sm text-amber-950">{qualityNote}</p>
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
        <p className="text-sm text-slate-700">
          Consultation is skipped. Materials can still be generated from the {vocab.product.singular} alone.
        </p>
      ) : null}
      {session?.status === "PAUSED" ? (
        <p className="text-sm text-slate-700">Paused. Resume when you want to continue.</p>
      ) : null}
      {session?.status === "DONE" ? (
        <p className="text-sm text-slate-700">{consultationConversationCopy.planComplete}</p>
      ) : null}

      {canEdit &&
      !session &&
      !jobs.some(
        (job) =>
          job.type === "CONSULTATION" &&
          (job.status === "PENDING" || job.status === "IN_PROGRESS"),
      ) ? (
        <div className="flex flex-wrap gap-3">
          <ApplicationActionForm
            action={startConsultationAction}
            submitLabel={consultationConversationCopy.start}
            testId="start-consultation"
          >
            <input type="hidden" name="campaignId" value={campaignId} />
          </ApplicationActionForm>
          <ApplicationActionForm action={skipConsultationAction} submitLabel="Skip consultation" testId="skip-consultation">
            <input type="hidden" name="campaignId" value={campaignId} />
          </ApplicationActionForm>
        </div>
      ) : null}

      {session && session.turns.length > 0 && !failed ? (
        <div className="space-y-3" data-testid="consultation-thread">
          {session.turns.map((turn) => {
            const statements = statementsByTurn.get(turn.id) ?? [];
            const showConfirm =
              canEdit &&
              session.status === "IN_PROGRESS" &&
              turn.id === latestDraftTurnId &&
              statements.some((statement) => statement.status === "DRAFT");
            return (
              <div
                key={turn.id}
                className={
                  turn.speaker === "CONSULTANT"
                    ? "rounded-md border border-slate-200 bg-slate-50 p-3"
                    : "rounded-md border border-slate-200 bg-white p-3"
                }
                data-testid={
                  turn.speaker === "CONSULTANT"
                    ? "consultation-question"
                    : "consultation-reply"
                }
              >
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {turn.speaker === "CONSULTANT"
                    ? consultationConfig.displayName
                    : "You"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">
                  {turn.body}
                </p>
                {statements.map((statement) => (
                  <div
                    key={statement.id}
                    className="mt-3 space-y-1 border-t border-slate-200 pt-3"
                    data-testid={`consultation-statement-${statement.kind}`}
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {consultationStatementLabels[statement.kind]}
                    </p>
                    {statement.strengtheningNote ? (
                      <p
                        className="text-sm text-slate-700"
                        data-testid="consultation-strengthening-note"
                      >
                        {statement.strengtheningNote}
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap text-sm text-slate-800">
                      {statement.content}
                    </p>
                  </div>
                ))}
                {showConfirm ? (
                  <div className="mt-3 space-y-3" data-testid="consultation-confirm">
                    <ApplicationActionForm
                      action={useConsultationResultAction}
                      submitLabel={consultationConversationCopy.useThis}
                      testId="use-consultation-result"
                    >
                      <input type="hidden" name="campaignId" value={campaignId} />
                    </ApplicationActionForm>
                    <ApplicationActionForm
                      action={reviseConsultationResultAction}
                      submitLabel={consultationConversationCopy.changeSomething}
                      testId="change-consultation-result"
                    >
                      <input type="hidden" name="campaignId" value={campaignId} />
                      <label className="block text-sm">
                        <span className="font-medium text-slate-700">
                          {consultationConversationCopy.changePrompt}
                        </span>
                        <textarea name="instruction" required rows={3} className={fieldClass} />
                      </label>
                    </ApplicationActionForm>
                    <ApplicationActionForm
                      action={flagConsultationInaccuracyAction}
                      submitLabel={consultationConversationCopy.notAccurate}
                      testId="flag-consultation-result"
                    >
                      <input type="hidden" name="campaignId" value={campaignId} />
                    </ApplicationActionForm>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {canEdit &&
      session?.status === "IN_PROGRESS" &&
      !failed &&
      !jobs.some(
        (job) =>
          job.type === "CONSULTATION" &&
          (job.status === "PENDING" || job.status === "IN_PROGRESS"),
      ) &&
      session.generationStatus !== "GENERATING" ? (
        <div className="space-y-4">
          <ApplicationActionForm
            action={replyConsultationAction}
            submitLabel={consultationConversationCopy.threadReply}
            testId="consultation-reply"
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <label className="block text-sm">
              <span className="font-medium text-slate-700">
                {consultationConversationCopy.threadReply}
              </span>
              <textarea name="answer" required rows={4} className={fieldClass} />
            </label>
          </ApplicationActionForm>
          <div className="flex flex-wrap gap-3">
            <ApplicationActionForm action={pauseConsultationAction} submitLabel="Pause" testId="pause-consultation">
              <input type="hidden" name="campaignId" value={campaignId} />
            </ApplicationActionForm>
            <ApplicationActionForm action={completeConsultationAction} submitLabel="Done" testId="done-consultation">
              <input type="hidden" name="campaignId" value={campaignId} />
            </ApplicationActionForm>
            <ApplicationActionForm action={skipConsultationAction} submitLabel="Skip the rest" testId="skip-consultation-open">
              <input type="hidden" name="campaignId" value={campaignId} />
            </ApplicationActionForm>
          </div>
        </div>
      ) : null}

      {canEdit && (session?.status === "PAUSED" || session?.status === "SKIPPED") ? (
        <ApplicationActionForm action={resumeConsultationAction} submitLabel="Resume" testId="resume-consultation">
          <input type="hidden" name="campaignId" value={campaignId} />
        </ApplicationActionForm>
      ) : null}
      </div>
    </details>
  );
}

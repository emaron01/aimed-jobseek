import {
  approveConsultationStatementAction,
  answerConsultationAction,
  completeConsultationAction,
  confirmConsultationProposalAction,
  dismissConsultationProposalAction,
  pauseConsultationAction,
  regenerateConsultationStatementAction,
  retryConsultationAction,
  resumeConsultationAction,
  skipConsultationAction,
  skipConsultationQuestionAction,
  startConsultationAction,
} from "@/app/actions/consultation";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { prisma } from "@/lib/prisma";
import {
  consultationConfig,
  consultationStatementLabels,
  evidenceStrengthLabels,
  vocab,
} from "@/lib/product-config";
import { parseStringArray } from "@/lib/research";

const fieldClass = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

function storyFields(value: unknown): {
  situation: string;
  task: string;
  action: string;
  result: string;
} | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.result !== "string") return null;
  return {
    situation: typeof row.situation === "string" ? row.situation : "",
    task: typeof row.task === "string" ? row.task : "",
    action: typeof row.action === "string" ? row.action : "",
    result: row.result,
  };
}

function storyLinks(value: unknown): Array<{
  id: string;
  text: string;
  explanation: string;
}> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const link = entry as Record<string, unknown>;
    if (
      typeof link.id !== "string" ||
      typeof link.text !== "string" ||
      typeof link.explanation !== "string"
    ) {
      return [];
    }
    return [{
      id: link.id,
      text: link.text,
      explanation: link.explanation,
    }];
  });
}

function questionContext(value: unknown): {
  requirementInterpretation: string | null;
  whoCaresNote: string;
} | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.whoCaresNote !== "string" || !row.whoCaresNote.trim()) {
    return null;
  }
  return {
    requirementInterpretation:
      typeof row.requirementInterpretation === "string" &&
      row.requirementInterpretation.trim()
        ? row.requirementInterpretation.trim()
        : null,
    whoCaresNote: row.whoCaresNote.trim(),
  };
}

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
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
}) {
  const session = await prisma.consultationSession.findFirst({
    where: { campaignId, organizationId },
    include: {
      assessments: { orderBy: { targetKey: "asc" } },
      turns: { orderBy: { sequence: "asc" } },
      proposals: { where: { status: "PENDING" }, orderBy: { createdAt: "asc" } },
      statements: { orderBy: [{ turnId: "asc" }, { kind: "asc" }] },
    },
  });
  const openQuestions = (session?.turns ?? []).filter((turn) => {
    if (turn.speaker !== "CONSULTANT" || !turn.targetKey) return false;
    const later = session?.turns.some(
      (other) =>
        other.speaker === "SEEKER" &&
        other.targetKey === turn.targetKey &&
        other.sequence > turn.sequence,
    );
    const newerQuestion = session?.turns.some(
      (other) =>
        other.speaker === "CONSULTANT" &&
        other.targetKey === turn.targetKey &&
        other.sequence > turn.sequence,
    );
    return !later && !newerQuestion;
  });

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5" data-testid="consultation">
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          Consultation with {consultationConfig.displayName}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {consultationConfig.displayName} compares this job with the {vocab.product.singular} and asks for the stories behind the gaps. Nothing is added to the {vocab.product.singular} until you confirm it. You can skip this and still generate materials from the {vocab.product.singular} alone.
        </p>
      </div>

      {session && session.assessments.length > 0 ? (
        <ul className="space-y-2" data-testid="consultation-evidence">
          {session.assessments.map((item) => (
            <li key={item.id} className="space-y-1 text-sm text-slate-800">
              <div>
                <span className="font-medium">{item.text}</span>
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-800">
                  {evidenceStrengthLabels[item.strength]}
                </span>
              </div>
              {item.explanation ? <p>{item.explanation}</p> : null}
              {item.strategyText ? (
                <p className="text-slate-600">{item.strategyText}</p>
              ) : null}
              {parseStringArray(item.supportingFactIds).length > 0 ? (
                <p className="text-xs text-slate-500">
                  Supported by {parseStringArray(item.supportingFactIds).join(", ")}
                </p>
              ) : null}
              {(() => {
                const calculation = experienceCalculation(
                  item.experienceCalculationJson,
                );
                if (!calculation) return null;
                return (
                  <p className="text-xs text-slate-500">
                    Verified experience: {calculation.totalYears} years
                    ({calculation.totalMonths} months) toward {calculation.requiredYears}
                    years
                    {calculation.periods.length > 0
                      ? ` across ${calculation.periods
                          .map(
                            (period) =>
                              `${period.roleId}: ${period.startDate}–${period.endDate}`,
                          )
                          .join("; ")}`
                      : ""}
                    {calculation.missingDateRoleIds.length > 0
                      ? `. Dates needed for ${calculation.missingDateRoleIds.join(", ")}.`
                      : "."}
                  </p>
                );
              })()}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-600">Evidence has not been assessed yet.</p>
      )}

      {session?.coachNote ? (
        <p className="text-sm text-slate-800" data-testid="consultation-coach">
          {session.coachNote}
        </p>
      ) : null}

      {session?.generationStatus === "FAILED" ? (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm text-amber-950">
            {session.generationError ?? "Consultation generation failed."}
          </p>
          {canEdit ? (
            <ApplicationActionForm
              action={retryConsultationAction}
              submitLabel="Retry consultation"
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
        <p className="text-sm text-slate-700">Consultation is done.</p>
      ) : null}

      {canEdit && !session ? (
        <div className="flex flex-wrap gap-3">
          <ApplicationActionForm action={startConsultationAction} submitLabel={`Start with ${consultationConfig.displayName}`} testId="start-consultation">
            <input type="hidden" name="campaignId" value={campaignId} />
          </ApplicationActionForm>
          <ApplicationActionForm action={skipConsultationAction} submitLabel="Skip consultation" testId="skip-consultation">
            <input type="hidden" name="campaignId" value={campaignId} />
          </ApplicationActionForm>
        </div>
      ) : null}

      {canEdit &&
      session?.status === "IN_PROGRESS" &&
      session.generationStatus !== "FAILED" ? (
        <div className="space-y-4">
          {openQuestions.map((question) => (
            <div key={question.id} className="space-y-2 rounded-md border border-slate-200 p-3" data-testid="consultation-question">
              <p className="text-sm text-slate-900">{question.body}</p>
              {questionContext(question.questionContextJson)?.requirementInterpretation ? (
                <p className="text-sm text-slate-600">
                  {questionContext(question.questionContextJson)?.requirementInterpretation}
                </p>
              ) : null}
              {questionContext(question.questionContextJson)?.whoCaresNote ? (
                <p className="text-sm text-slate-700" data-testid="who-cares-note">
                  {questionContext(question.questionContextJson)?.whoCaresNote}
                </p>
              ) : null}
              <ApplicationActionForm action={answerConsultationAction} submitLabel="Save answer" testId={`answer-${question.targetKey}`}>
                <input type="hidden" name="campaignId" value={campaignId} />
                <input type="hidden" name="targetKey" value={question.targetKey ?? ""} />
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Your answer</span>
                  <textarea name="answer" required rows={4} className={fieldClass} />
                </label>
              </ApplicationActionForm>
              <ApplicationActionForm action={skipConsultationQuestionAction} submitLabel="Skip question" testId={`skip-question-${question.targetKey}`}>
                <input type="hidden" name="campaignId" value={campaignId} />
                <input type="hidden" name="targetKey" value={question.targetKey ?? ""} />
              </ApplicationActionForm>
            </div>
          ))}
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

      {session && session.statements.length > 0 ? (
        <div className="space-y-3" data-testid="consultation-statements">
          <h3 className="text-sm font-semibold text-slate-900">
            {consultationStatementLabels.section}
          </h3>
          {session.statements.map((statement) => (
            <div
              key={statement.id}
              className="space-y-2 rounded-md border border-slate-200 p-3"
              data-testid={`consultation-statement-${statement.kind}`}
            >
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-medium text-slate-900">
                  {consultationStatementLabels[statement.kind]}
                </h4>
                <span className="text-xs text-slate-500">
                  {consultationStatementLabels[statement.status]}
                </span>
              </div>
              {canEdit ? (
                <>
                  <ApplicationActionForm
                    action={approveConsultationStatementAction}
                    submitLabel={
                      statement.status === "APPROVED"
                        ? "Save approved edit"
                        : "Approve statement"
                    }
                    testId={`approve-statement-${statement.id}`}
                  >
                    <input type="hidden" name="campaignId" value={campaignId} />
                    <input type="hidden" name="statementId" value={statement.id} />
                    <textarea
                      name="content"
                      required
                      rows={statement.kind === "INTERVIEW_ANSWER" ? 6 : 3}
                      defaultValue={statement.content}
                      className={fieldClass}
                    />
                  </ApplicationActionForm>
                  <ApplicationActionForm
                    action={regenerateConsultationStatementAction}
                    submitLabel="Regenerate statement"
                    testId={`regenerate-statement-${statement.id}`}
                  >
                    <input type="hidden" name="campaignId" value={campaignId} />
                    <input type="hidden" name="statementId" value={statement.id} />
                  </ApplicationActionForm>
                </>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-slate-800">
                  {statement.content}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {session && session.proposals.length > 0 ? (
        <div className="space-y-3" data-testid="consultation-proposals">
          <h3 className="text-sm font-semibold text-slate-900">Confirm before saving</h3>
          {session.proposals.map((proposal) => {
            const story = storyFields(proposal.storyJson);
            const links = storyLinks(proposal.competencyLinks);
            return (
              <div key={proposal.id} className="space-y-2 rounded-md border border-slate-200 p-3">
                <ApplicationActionForm
                  action={confirmConsultationProposalAction}
                  submitLabel={`Save to ${vocab.product.singular}`}
                  testId={`confirm-proposal-${proposal.id}`}
                >
                  <input type="hidden" name="campaignId" value={campaignId} />
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  {story ? (
                    <>
                      <label className="block text-sm">
                        <span className="font-medium text-slate-700">Situation</span>
                        <textarea name="situation" required rows={2} defaultValue={story.situation} className={fieldClass} />
                      </label>
                      <label className="block text-sm">
                        <span className="font-medium text-slate-700">Task</span>
                        <textarea name="task" required rows={2} defaultValue={story.task} className={fieldClass} />
                      </label>
                      <label className="block text-sm">
                        <span className="font-medium text-slate-700">Action</span>
                        <textarea name="action" required rows={2} defaultValue={story.action} className={fieldClass} />
                      </label>
                      <label className="block text-sm">
                        <span className="font-medium text-slate-700">Result</span>
                        <textarea name="result" required rows={2} defaultValue={story.result} className={fieldClass} />
                      </label>
                      <input type="hidden" name="text" value={story.result} />
                      {links.length > 0 ? (
                        <div className="text-sm text-slate-700">
                          <p className="font-medium">Proposed job links</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5">
                            {links.map((link) => (
                              <li key={link.id}>
                                {link.text}: {link.explanation}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">Fact</span>
                      <textarea name="text" required rows={3} defaultValue={proposal.text} className={fieldClass} />
                    </label>
                  )}
                </ApplicationActionForm>
                <ApplicationActionForm action={dismissConsultationProposalAction} submitLabel="Dismiss" testId={`dismiss-proposal-${proposal.id}`}>
                  <input type="hidden" name="campaignId" value={campaignId} />
                  <input type="hidden" name="proposalId" value={proposal.id} />
                </ApplicationActionForm>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

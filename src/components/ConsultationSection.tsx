import {
  answerConsultationAction,
  completeConsultationAction,
  confirmConsultationProposalAction,
  dismissConsultationProposalAction,
  pauseConsultationAction,
  resumeConsultationAction,
  skipConsultationAction,
  skipConsultationQuestionAction,
  startConsultationAction,
} from "@/app/actions/consultation";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { prisma } from "@/lib/prisma";
import {
  consultationConfig,
  evidenceStrengthLabels,
  gapStrategyCopy,
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
            <li key={item.id} className="text-sm text-slate-800">
              <span className="font-medium">{item.text}</span>
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-800">
                {evidenceStrengthLabels[item.strength]}
              </span>
              {item.strategy ? (
                <span className="ml-2 text-slate-600">{gapStrategyCopy[item.strategy]}</span>
              ) : null}
              {parseStringArray(item.supportingFactIds).length > 0 ? (
                <span className="mt-1 block text-xs text-slate-500">
                  Supported by {parseStringArray(item.supportingFactIds).join(", ")}
                </span>
              ) : null}
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

      {canEdit && session?.status === "IN_PROGRESS" ? (
        <div className="space-y-4">
          {openQuestions.map((question) => (
            <div key={question.id} className="space-y-2 rounded-md border border-slate-200 p-3" data-testid="consultation-question">
              <p className="text-sm text-slate-900">{question.body}</p>
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

      {session && session.proposals.length > 0 ? (
        <div className="space-y-3" data-testid="consultation-proposals">
          <h3 className="text-sm font-semibold text-slate-900">Confirm before saving</h3>
          {session.proposals.map((proposal) => {
            const story = storyFields(proposal.storyJson);
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

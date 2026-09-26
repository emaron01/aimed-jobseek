import { generateOutreachAssetAction } from "@/app/actions/application-outreach";
import {
  createInterviewStageAction,
  startInterviewGapConsultationAction,
  updateInterviewStageAction,
} from "@/app/actions/interview";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { InterviewStagePanel } from "@/components/InterviewStagePanel";
import { listApplicationContacts } from "@/lib/application/contacts";
import { getApplicationSummaryView } from "@/lib/application-summary/service";
import { listInterviewStages, stageTypeLabel } from "@/lib/interview/stages";
import { interviewConfig } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";
import { AppActionLink } from "@/components/ui";
import { workspaceInterviewStageHref } from "@/lib/application/workspace-links";

type RoleOption = { id: string; name: string; suggestionKey: string | null };

function datetimeLocal(value: Date): string {
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  return `${value.getUTCFullYear()}-${month}-${day}T${hours}:${minutes}`;
}

function dateInput(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

export async function InterviewStagesSection({
  campaignId,
  organizationId,
  canEdit,
  roles,
  contacts,
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
  roles: RoleOption[];
  contacts: Array<{ contactId: string; personaId: string | null }>;
}) {
  const [stages, memberships, summary] = await Promise.all([
    listInterviewStages({ organizationId, campaignId }),
    listApplicationContacts({ organizationId, campaignId }),
    getApplicationSummaryView({ organizationId, campaignId }).catch((error) => {
      if (error instanceof TenantError) return null;
      throw error;
    }),
  ]);
  const people = memberships.map((row) => ({
    contactId: row.contactId,
    name: [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" ").trim()
      || row.contact.title
      || row.chosenPersona?.name
      || row.contactId,
    title: row.contact.title,
    personaId: row.chosenPersonaId,
    personaName: row.chosenPersona?.name ?? null,
  }));
  const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";

  return (
    <section
      className="space-y-4 rounded-lg border border-edge bg-surface p-5"
      data-testid="interview-stages"
    >
      <div>
        <h2 className="text-base font-semibold text-ink">
          {interviewConfig.labels.sectionTitle}
        </h2>
        <p className="mt-1 text-sm text-muted">{interviewConfig.labels.sectionHelp}</p>
      </div>

      {canEdit ? (
        <ApplicationActionForm
          action={createInterviewStageAction}
          submitLabel={interviewConfig.labels.addStage}
          testId="add-interview-stage"
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              Type
              <select name="type" className={fieldClass} defaultValue="RECRUITER_SCREEN">
                {Object.entries(interviewConfig.types).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Format
              <select name="format" className={fieldClass} defaultValue="VIDEO">
                {Object.entries(interviewConfig.formats).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Date and time
              <input name="scheduledAt" type="datetime-local" required className={fieldClass} />
            </label>
            <label className="text-sm">
              {interviewConfig.labels.expectedDecision}
              <input name="expectedDecisionAt" type="date" className={fieldClass} />
            </label>
            <label className="text-sm md:col-span-2">
              {interviewConfig.labels.notesBefore}
              <textarea name="notesBefore" rows={2} className={fieldClass} />
            </label>
          </div>
        </ApplicationActionForm>
      ) : null}

      {stages.length === 0 ? (
        <p className="text-sm text-subtle">No stages yet.</p>
      ) : (
        <div className="space-y-6">
          {stages.map((stage) => {
            const interviewerPersona = (contactId: string) =>
              contacts.find((row) => row.contactId === contactId)?.personaId ??
              roles[0]?.id ??
              "";
            const interviewer = stage.interviewers[0] ?? null;
            const sectionKey = interviewer ? `contact:${interviewer.contactId}` : null;
            const person = sectionKey
              ? summary?.people.find((item) => item.sectionKey === sectionKey)
              : null;
            const section = sectionKey
              ? summary?.guidance?.people.find((item) => item.sectionKey === sectionKey) ?? null
              : null;
            const notes = interviewer
              ? summary?.notesByContactId.get(interviewer.contactId) ?? []
              : [];
            const heading =
              person?.heading
              ?? (interviewer
                ? [interviewer.contact.firstName, interviewer.contact.lastName]
                    .filter(Boolean)
                    .join(" ")
                    .trim()
                : "");
            const offer =
              stage.consultationOfferJson &&
              typeof stage.consultationOfferJson === "object"
                ? (stage.consultationOfferJson as {
                    text?: string;
                    targetKey?: string;
                  })
                : null;
            const thankYouClarify =
              stage.thankYouClarifyJson &&
              typeof stage.thankYouClarifyJson === "object"
                ? (stage.thankYouClarifyJson as {
                    questions?: Array<{ id: string; text: string }>;
                    answers?: Array<{ id: string; answer: string }>;
                    skipped?: boolean;
                  })
                : null;
            const thankYouQuestions =
              thankYouClarify?.questions?.filter((item) => item.id && item.text) ??
              [];
            const thankYouNeedsAnswers =
              thankYouQuestions.length > 0 &&
              !thankYouClarify?.skipped &&
              !(thankYouClarify?.answers?.some((item) => item.answer?.trim()) ??
                false);
            return (
              <article
                key={stage.id}
                className="space-y-3 border-t border-edge pt-4"
                data-testid={`interview-stage-${stage.id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium text-ink">
                    {stageTypeLabel(stage.type)} ·{" "}
                    {interviewConfig.formats[stage.format]}
                  </h3>
                  <AppActionLink
                    href={workspaceInterviewStageHref(campaignId, stage.id)}
                    variant="secondary"
                  >
                    {interviewConfig.labels.openGuide}
                  </AppActionLink>
                </div>
                <p className="text-sm text-muted">
                  {stage.scheduledAt.toLocaleString()}
                  {stage.outcome
                    ? ` · ${interviewConfig.outcomes[stage.outcome]}`
                    : ""}
                </p>
                <InterviewStagePanel
                  campaignId={campaignId}
                  canEdit={canEdit}
                  stageId={stage.id}
                  interviewerContactId={interviewer?.contactId ?? null}
                  people={people}
                  roles={roles}
                  heading={heading || interviewConfig.labels.interviewer}
                  sectionKey={sectionKey}
                  section={section}
                  notes={notes}
                />

                {canEdit ? (
                  <>
                    <ApplicationActionForm
                      action={updateInterviewStageAction}
                      submitLabel={interviewConfig.labels.saveStage}
                      testId={`update-stage-${stage.id}`}
                    >
                      <input type="hidden" name="campaignId" value={campaignId} />
                      <input type="hidden" name="stageId" value={stage.id} />
                      <input
                        type="hidden"
                        name="scheduledAt"
                        value={datetimeLocal(stage.scheduledAt)}
                      />
                      <input type="hidden" name="format" value={stage.format} />
                      <label className="text-sm">
                        {interviewConfig.labels.notesBefore}
                        <textarea
                          name="notesBefore"
                          rows={2}
                          className={fieldClass}
                          defaultValue={stage.notesBefore ?? ""}
                        />
                      </label>
                      <label className="text-sm">
                        {interviewConfig.labels.notesAfter}
                        <textarea
                          name="notesAfter"
                          rows={3}
                          className={fieldClass}
                          defaultValue={stage.notesAfter ?? ""}
                        />
                      </label>
                      <label className="text-sm">
                        {interviewConfig.labels.expectedDecision}
                        <input
                          name="expectedDecisionAt"
                          type="date"
                          className={fieldClass}
                          defaultValue={dateInput(stage.expectedDecisionAt)}
                        />
                      </label>
                      <label className="text-sm">
                        {interviewConfig.labels.outcome}
                        <select
                          name="outcome"
                          className={fieldClass}
                          defaultValue={stage.outcome ?? ""}
                        >
                          <option value="">{interviewConfig.labels.noOutcome}</option>
                          {Object.entries(interviewConfig.outcomes).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                    </ApplicationActionForm>

                    {stage.notesAfter && stage.interviewers[0] ? (
                      <div className="space-y-3">
                        {thankYouNeedsAnswers ? (
                          <ApplicationActionForm
                            action={generateOutreachAssetAction}
                            submitLabel={
                              interviewConfig.labels.answerThankYouQuestions
                            }
                            testId={`thank-you-answers-${stage.id}`}
                          >
                            <input type="hidden" name="campaignId" value={campaignId} />
                            <input
                              type="hidden"
                              name="interviewStageId"
                              value={stage.id}
                            />
                            <input
                              type="hidden"
                              name="contactId"
                              value={stage.interviewers[0]!.contactId}
                            />
                            <input
                              type="hidden"
                              name="personaId"
                              value={interviewerPersona(
                                stage.interviewers[0]!.contactId,
                              )}
                            />
                            <input type="hidden" name="type" value="EMAIL" />
                            <input type="hidden" name="purpose" value="THANK_YOU" />
                            <p className="text-sm text-muted">
                              {interviewConfig.labels.thankYouClarifyHelp}
                            </p>
                            {thankYouQuestions.map((question) => (
                              <label key={question.id} className="text-sm">
                                {question.text}
                                <input
                                  type="hidden"
                                  name="thankYouAnswerId"
                                  value={question.id}
                                />
                                <textarea
                                  name="thankYouAnswer"
                                  rows={2}
                                  className={fieldClass}
                                />
                              </label>
                            ))}
                          </ApplicationActionForm>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                        <ApplicationActionForm
                          action={generateOutreachAssetAction}
                          submitLabel={interviewConfig.labels.thankYouEmail}
                          testId={`thank-you-email-${stage.id}`}
                        >
                          <input type="hidden" name="campaignId" value={campaignId} />
                          <input type="hidden" name="interviewStageId" value={stage.id} />
                          <input
                            type="hidden"
                            name="contactId"
                            value={stage.interviewers[0]!.contactId}
                          />
                          <input
                            type="hidden"
                            name="personaId"
                            value={interviewerPersona(stage.interviewers[0]!.contactId)}
                          />
                          <input type="hidden" name="type" value="EMAIL" />
                          <input type="hidden" name="purpose" value="THANK_YOU" />
                          {thankYouNeedsAnswers ? (
                            <input
                              type="hidden"
                              name="skipThankYouQuestions"
                              value="1"
                            />
                          ) : null}
                        </ApplicationActionForm>
                        <ApplicationActionForm
                          action={generateOutreachAssetAction}
                          submitLabel={interviewConfig.labels.thankYouLinkedIn}
                          testId={`thank-you-linkedin-${stage.id}`}
                        >
                          <input type="hidden" name="campaignId" value={campaignId} />
                          <input type="hidden" name="interviewStageId" value={stage.id} />
                          <input
                            type="hidden"
                            name="contactId"
                            value={stage.interviewers[0]!.contactId}
                          />
                          <input
                            type="hidden"
                            name="personaId"
                            value={interviewerPersona(stage.interviewers[0]!.contactId)}
                          />
                          <input type="hidden" name="type" value="LINKEDIN_INMAIL" />
                          <input type="hidden" name="purpose" value="THANK_YOU" />
                          {thankYouNeedsAnswers ? (
                            <input
                              type="hidden"
                              name="skipThankYouQuestions"
                              value="1"
                            />
                          ) : null}
                        </ApplicationActionForm>
                        <ApplicationActionForm
                          action={generateOutreachAssetAction}
                          submitLabel={interviewConfig.labels.checkIn}
                          testId={`check-in-${stage.id}`}
                        >
                          <input type="hidden" name="campaignId" value={campaignId} />
                          <input type="hidden" name="interviewStageId" value={stage.id} />
                          <input
                            type="hidden"
                            name="contactId"
                            value={stage.interviewers[0]!.contactId}
                          />
                          <input
                            type="hidden"
                            name="personaId"
                            value={interviewerPersona(stage.interviewers[0]!.contactId)}
                          />
                          <input type="hidden" name="type" value="EMAIL" />
                          <input type="hidden" name="purpose" value="CHECK_IN" />
                        </ApplicationActionForm>
                        </div>
                      </div>
                    ) : null}

                    {offer?.text ? (
                      <ApplicationActionForm
                        action={startInterviewGapConsultationAction}
                        submitLabel={interviewConfig.labels.startConsultation}
                        testId={`consultation-offer-${stage.id}`}
                      >
                        <input type="hidden" name="campaignId" value={campaignId} />
                        <input type="hidden" name="focusNote" value={offer.text} />
                        {offer.targetKey ? (
                          <input
                            type="hidden"
                            name="focusTargetKey"
                            value={offer.targetKey}
                          />
                        ) : null}
                        <p className="text-sm text-ink">
                          {interviewConfig.labels.consultationOffer} {offer.text}
                        </p>
                      </ApplicationActionForm>
                    ) : null}
                  </>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

import Link from "next/link";
import { generateOutreachAssetAction } from "@/app/actions/application-outreach";
import {
  addInterviewInterviewerAction,
  createInterviewStageAction,
  generateInterviewGuideAction,
  startInterviewGapConsultationAction,
  updateInterviewStageAction,
} from "@/app/actions/interview";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { listInterviewStages, stageTypeLabel } from "@/lib/interview/stages";
import { parseClarifyingQuestions } from "@/lib/interview/guide";
import { interviewConfig, vocab } from "@/lib/product-config";
import { SECONDARY_BUTTON_CLASS } from "@/components/ui";
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
  const stages = await listInterviewStages({ organizationId, campaignId });
  const fieldClass = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

  return (
    <section
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
      data-testid="interview-stages"
    >
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          {interviewConfig.labels.sectionTitle}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{interviewConfig.labels.sectionHelp}</p>
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
        <p className="text-sm text-slate-500">No stages yet.</p>
      ) : (
        <div className="space-y-6">
          {stages.map((stage) => {
            const questions = parseClarifyingQuestions(
              stage.guide?.clarifyingQuestionsJson,
            );
            const interviewerPersona = (contactId: string) =>
              contacts.find((row) => row.contactId === contactId)?.personaId ??
              roles[0]?.id ??
              "";
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
                className="space-y-3 border-t border-slate-100 pt-4"
                data-testid={`interview-stage-${stage.id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium text-slate-900">
                    {stageTypeLabel(stage.type)} ·{" "}
                    {interviewConfig.formats[stage.format]}
                  </h3>
                  <Link
                    href={workspaceInterviewStageHref(campaignId, stage.id)}
                    className={SECONDARY_BUTTON_CLASS}
                  >
                    {interviewConfig.labels.openGuide}
                  </Link>
                </div>
                <p className="text-sm text-slate-600">
                  {stage.scheduledAt.toLocaleString()}
                  {stage.outcome
                    ? ` · ${interviewConfig.outcomes[stage.outcome]}`
                    : ""}
                </p>
                <ul className="text-sm text-slate-800">
                  {stage.interviewers.map((row) => (
                    <li key={row.id}>
                      {[row.contact.firstName, row.contact.lastName]
                        .filter(Boolean)
                        .join(" ")}
                      {row.contact.title ? ` · ${row.contact.title}` : ""}
                    </li>
                  ))}
                </ul>

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

                    <ApplicationActionForm
                      action={addInterviewInterviewerAction}
                      submitLabel={interviewConfig.labels.addInterviewer}
                      testId={`add-interviewer-${stage.id}`}
                    >
                      <input type="hidden" name="campaignId" value={campaignId} />
                      <input type="hidden" name="stageId" value={stage.id} />
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-sm">
                          First name
                          <input name="firstName" required className={fieldClass} />
                        </label>
                        <label className="text-sm">
                          Last name
                          <input name="lastName" required className={fieldClass} />
                        </label>
                        <label className="text-sm">
                          Title
                          <input name="title" required className={fieldClass} />
                        </label>
                        <label className="text-sm">
                          {vocab.persona.Singular}
                          <select name="personaId" className={fieldClass}>
                            <option value="">Match from title</option>
                            {roles.map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm">
                          Email
                          <input name="email" type="email" className={fieldClass} />
                        </label>
                        <label className="text-sm">
                          LinkedIn URL
                          <input name="linkedinUrl" className={fieldClass} />
                        </label>
                      </div>
                    </ApplicationActionForm>

                    {questions.length > 0 && stage.guide?.status !== "READY" ? (
                      <ApplicationActionForm
                        action={generateInterviewGuideAction}
                        submitLabel={interviewConfig.labels.answerQuestions}
                        testId={`guide-answers-${stage.id}`}
                      >
                        <input type="hidden" name="campaignId" value={campaignId} />
                        <input type="hidden" name="stageId" value={stage.id} />
                        <p className="text-sm text-slate-600">
                          {interviewConfig.labels.clarifyingHelp}
                        </p>
                        {questions.map((question) => (
                          <label key={question.id} className="text-sm">
                            {question.text}
                            <input type="hidden" name="answerId" value={question.id} />
                            <textarea name="answer" rows={2} className={fieldClass} />
                          </label>
                        ))}
                      </ApplicationActionForm>
                    ) : null}

                    <ApplicationActionForm
                      action={generateInterviewGuideAction}
                      submitLabel={
                        stage.guide?.status === "READY"
                          ? interviewConfig.labels.regenerateGuide
                          : interviewConfig.labels.generateGuide
                      }
                      testId={`generate-guide-${stage.id}`}
                    >
                      <input type="hidden" name="campaignId" value={campaignId} />
                      <input type="hidden" name="stageId" value={stage.id} />
                      {questions.length > 0 ? (
                        <input type="hidden" name="skipQuestions" value="1" />
                      ) : null}
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
                            <p className="text-sm text-slate-600">
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
                        <p className="text-sm text-slate-700">
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

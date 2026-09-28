import {
  addCheatSheetInterviewNoteAction,
  createInterviewStageAction,
  updateInterviewStageAction,
} from "@/app/actions/interview";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { InterviewStagePanel } from "@/components/InterviewStagePanel";
import { listApplicationContacts } from "@/lib/application/contacts";
import {
  listInterviewStages,
  openInterviewStage,
  stageTypeLabel,
} from "@/lib/interview/stages";
import { InterviewStageOpenActions } from "@/components/InterviewStageOpenActions";
import { interviewConfig } from "@/lib/product-config";
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
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
  roles: RoleOption[];
  contacts: Array<{ contactId: string; personaId: string | null }>;
}) {
  const [stages, memberships] = await Promise.all([
    listInterviewStages({ organizationId, campaignId }),
    listApplicationContacts({ organizationId, campaignId }),
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
  const openStage = openInterviewStage(stages);

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
            const interviewer = stage.interviewers[0] ?? null;
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
                  <div className="flex flex-wrap gap-2">
                    {openStage?.id === stage.id ? (
                      <InterviewStageOpenActions
                        campaignId={campaignId}
                        stageId={stage.id}
                        interviewerContactId={interviewer?.contactId ?? null}
                      />
                    ) : null}
                    <AppActionLink
                      href={workspaceInterviewStageHref(campaignId, stage.id)}
                      variant="secondary"
                    >
                      {interviewConfig.labels.openGuide}
                    </AppActionLink>
                  </div>
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
                />

                {canEdit ? (
                  <details
                    id={`post-interview-notes-${stage.id}`}
                    className="space-y-3 rounded-md border border-edge bg-canvas p-4"
                    data-testid={`post-interview-notes-form-${stage.id}`}
                  >
                    <summary className="cursor-pointer text-sm font-medium text-ink">
                      {interviewConfig.labels.postInterviewNotes}
                    </summary>
                    <div className="mt-3 space-y-3">
                      {interviewer ? (
                        <ApplicationActionForm
                          action={addCheatSheetInterviewNoteAction}
                          submitLabel={interviewConfig.labels.addGainedInformation}
                          testId={`add-cheat-sheet-note-${stage.id}`}
                        >
                          <input type="hidden" name="campaignId" value={campaignId} />
                          <input type="hidden" name="stageId" value={stage.id} />
                          <input
                            type="hidden"
                            name="contactId"
                            value={interviewer.contactId}
                          />
                          <label className="text-sm">
                            {interviewConfig.labels.gainedInformation}
                            <textarea
                              name="note"
                              rows={4}
                              required
                              className={fieldClass}
                            />
                            <span className="mt-1 block text-xs text-muted">
                              {interviewConfig.labels.gainedInformationHelp}
                            </span>
                          </label>
                        </ApplicationActionForm>
                      ) : null}
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
                    </div>
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

import {
  addCheatSheetInterviewNoteAction,
  createInterviewStageAction,
  updateInterviewStageAction,
} from "@/app/actions/interview";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { InterviewStageInterviewerLink } from "@/components/InterviewStagePanel";
import {
  InterviewerCollapsible,
  StageAddContactForm,
} from "@/components/StageInterviewerSection";
import { listApplicationContacts } from "@/lib/application/contacts";
import { parseCheatSheetNotes } from "@/lib/application-summary/notes";
import { listInterviewStages, stageTypeLabel } from "@/lib/interview/stages";
import { interviewConfig } from "@/lib/product-config";
import { prisma } from "@/lib/prisma-client";
import type {
  InterviewFormat,
  InterviewStageOutcome,
  InterviewStageType,
} from "@prisma/client";

type RoleOption = { id: string; name: string; suggestionKey: string | null };
type PersonOption = {
  contactId: string;
  name: string;
  title: string | null;
  personaId: string | null;
  personaName: string | null;
};
type StageView = {
  id: string;
  type: InterviewStageType;
  format: InterviewFormat;
  scheduledAt: Date;
  outcome: InterviewStageOutcome | null;
  notesBefore: string | null;
  notesAfter: string | null;
  expectedDecisionAt: Date | null;
  interviewers: Array<{
    id: string;
    contactId: string;
    contact: {
      firstName: string | null;
      lastName: string | null;
      title: string | null;
    };
  }>;
};

function dateLabel(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function StageStoredNotes({
  stageId,
  contactId,
  notesBefore,
  notesAfter,
  cheatSheetNotes,
  expectedDecisionAt,
  canEdit,
  campaignId,
}: {
  stageId: string;
  contactId: string | null;
  notesBefore: string | null;
  notesAfter: string | null;
  cheatSheetNotes: Array<{ id: string; text: string }>;
  expectedDecisionAt: Date | null;
  canEdit: boolean;
  campaignId: string;
}) {
  const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";
  const before = notesBefore?.trim() ?? "";
  const after = notesAfter?.trim() ?? "";
  return (
    <div
      className="space-y-3"
      data-testid={
        contactId
          ? `post-interview-notes-${stageId}-${contactId}`
          : `post-interview-notes-${stageId}`
      }
    >
      <h4 className="text-sm font-medium text-ink">{interviewConfig.labels.postInterviewNotes}</h4>
      {before ? (
        <p className="text-sm text-ink" data-testid={`stored-notes-before-${stageId}-${contactId ?? "stage"}`}>
          <span className="font-medium">{interviewConfig.labels.notesBefore}</span>
          <span className="mt-1 block whitespace-pre-wrap">{before}</span>
        </p>
      ) : null}
      {after ? (
        <p className="text-sm text-ink" data-testid={`stored-notes-after-${stageId}-${contactId ?? "stage"}`}>
          <span className="font-medium">{interviewConfig.labels.notesAfter}</span>
          <span className="mt-1 block whitespace-pre-wrap">{after}</span>
        </p>
      ) : null}
      {cheatSheetNotes.map((note) => (
        <p key={note.id} className="text-sm text-ink" data-testid={`stored-gained-note-${note.id}`}>
          <span className="font-medium">{interviewConfig.labels.gainedInformation}</span>
          <span className="mt-1 block whitespace-pre-wrap">{note.text}</span>
        </p>
      ))}
      {expectedDecisionAt ? (
        <p className="text-sm text-ink" data-testid={`saved-expected-decision-${stageId}`}>
          <span className="font-medium">{interviewConfig.labels.savedExpectedDecision}</span>
          <span className="mt-1 block">{dateLabel(expectedDecisionAt)}</span>
        </p>
      ) : null}
      {canEdit && contactId ? (
        <ApplicationActionForm
          action={addCheatSheetInterviewNoteAction}
          submitLabel={interviewConfig.labels.addGainedInformation}
          testId={`add-cheat-sheet-note-${stageId}-${contactId}`}
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="stageId" value={stageId} />
          <input type="hidden" name="contactId" value={contactId} />
          <label className="text-sm">
            {interviewConfig.labels.gainedInformation}
            <textarea name="note" rows={4} required className={fieldClass} />
          </label>
        </ApplicationActionForm>
      ) : null}
    </div>
  );
}

export function InterviewStagesList({
  campaignId,
  canEdit,
  roles,
  people,
  stages,
  notesByContactId,
}: {
  campaignId: string;
  canEdit: boolean;
  roles: RoleOption[];
  people: PersonOption[];
  stages: StageView[];
  notesByContactId: Map<string, ReturnType<typeof parseCheatSheetNotes>>;
}) {
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
        <div className="space-y-4">
          <p className="text-sm font-medium text-ink" data-testid="stage-create-start">
            {interviewConfig.labels.startByChoosing}
          </p>
          <StageAddContactForm campaignId={campaignId} roles={roles} />
          <ApplicationActionForm
            action={createInterviewStageAction}
            submitLabel={interviewConfig.labels.addStage}
            testId="add-interview-stage"
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm md:col-span-2">
                {interviewConfig.labels.interviewer}
                <select name="contactId" required className={fieldClass} defaultValue="">
                  <option value="">{interviewConfig.labels.noInterviewer}</option>
                  {people.map((person) => (
                    <option key={person.contactId} value={person.contactId}>
                      {person.name}
                      {person.title ? ` · ${person.title}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Type
                <select name="type" required className={fieldClass} defaultValue="RECRUITER_SCREEN">
                  {Object.entries(interviewConfig.types).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Format
                <select name="format" required className={fieldClass} defaultValue="VIDEO">
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
            </div>
          </ApplicationActionForm>
        </div>
      ) : null}

      {stages.length === 0 ? (
        <p className="text-sm text-subtle">No stages yet.</p>
      ) : (
        <div className="space-y-6">
          {stages.map((stage) => {
            const startOpen = stage.outcome == null && stage.interviewers.length === 1;
            return (
              <article
                key={stage.id}
                className="space-y-3 border-t border-edge pt-4"
                data-testid={`interview-stage-${stage.id}`}
              >
                <h3 className="font-medium text-ink">
                  {stageTypeLabel(stage.type)} · {interviewConfig.formats[stage.format]}
                </h3>
                <p className="text-sm text-muted">
                  {stage.scheduledAt.toLocaleString()}
                  {stage.outcome ? ` · ${interviewConfig.outcomes[stage.outcome]}` : ""}
                </p>
                {stage.interviewers.length === 0 ? (
                  <div data-testid={`stage-no-interviewer-${stage.id}`}>
                    <p className="text-sm text-ink">{interviewConfig.labels.noInterviewerOnStage}</p>
                    <StageStoredNotes
                      campaignId={campaignId}
                      stageId={stage.id}
                      contactId={null}
                      notesBefore={stage.notesBefore}
                      notesAfter={stage.notesAfter}
                      cheatSheetNotes={[]}
                      expectedDecisionAt={stage.expectedDecisionAt}
                      canEdit={false}
                    />
                  </div>
                ) : (
                  stage.interviewers.map((row) => {
                    const person = people.find((item) => item.contactId === row.contactId);
                    const display = person ?? {
                      contactId: row.contactId,
                      name: [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" ").trim()
                        || row.contact.title
                        || row.contactId,
                      title: row.contact.title,
                      personaId: null,
                      personaName: null,
                    };
                    const gained = (notesByContactId.get(row.contactId) ?? []).filter(
                      (note) => note.stageId === stage.id,
                    );
                    return (
                      <InterviewerCollapsible
                        key={row.id}
                        title={display.name}
                        startOpen={startOpen}
                        testId={`stage-interviewer-${stage.id}-${row.contactId}`}
                      >
                        <InterviewStageInterviewerLink campaignId={campaignId} person={display} />
                        <StageStoredNotes
                          campaignId={campaignId}
                          stageId={stage.id}
                          contactId={row.contactId}
                          notesBefore={stage.notesBefore}
                          notesAfter={stage.notesAfter}
                          cheatSheetNotes={gained}
                          expectedDecisionAt={stage.expectedDecisionAt}
                          canEdit={canEdit}
                        />
                      </InterviewerCollapsible>
                    );
                  })
                )}
                {canEdit ? (
                  <ApplicationActionForm
                    action={updateInterviewStageAction}
                    submitLabel={interviewConfig.labels.saveStage}
                    testId={`update-stage-${stage.id}`}
                  >
                    <input type="hidden" name="campaignId" value={campaignId} />
                    <input type="hidden" name="stageId" value={stage.id} />
                    <label className="text-sm">
                      {interviewConfig.labels.outcome}
                      <select
                        name="outcome"
                        className={fieldClass}
                        defaultValue={stage.outcome ?? ""}
                      >
                        <option value="">{interviewConfig.labels.noOutcome}</option>
                        {Object.entries(interviewConfig.outcomes).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </ApplicationActionForm>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
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
  const [stages, memberships, noteRows] = await Promise.all([
    listInterviewStages({ organizationId, campaignId }),
    listApplicationContacts({ organizationId, campaignId }),
    prisma.campaignContact.findMany({
      where: { organizationId, campaignId },
      select: { contactId: true, cheatSheetNotesJson: true },
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
  const notesByContactId = new Map(
    noteRows.map((row) => [row.contactId, parseCheatSheetNotes(row.cheatSheetNotesJson)]),
  );
  return (
    <InterviewStagesList
      campaignId={campaignId}
      canEdit={canEdit}
      roles={roles}
      people={people}
      stages={stages}
      notesByContactId={notesByContactId}
    />
  );
}

import { updateInterviewStageAction } from "@/app/actions/interview";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { InterviewStageInterviewerLink } from "@/components/InterviewStagePanel";
import {
  AddFollowUpInterview,
  AddSomeoneYoureMeeting,
  CheatSheetNoteForm,
  InterviewerCollapsible,
  RemoveInterviewControl,
  SavedInterviewNotes,
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

function compareNewest(
  left: { id: string; scheduledAt: Date },
  right: { id: string; scheduledAt: Date },
): number {
  const byDate = right.scheduledAt.getTime() - left.scheduledAt.getTime();
  if (byDate !== 0) return byDate;
  return right.id.localeCompare(left.id);
}

function personForInterviewer(
  row: StageView["interviewers"][number],
  people: PersonOption[],
): PersonOption {
  const person = people.find((item) => item.contactId === row.contactId);
  if (person) return person;
  const name =
    [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" ").trim() ||
    row.contact.title ||
    row.contactId;
  return {
    contactId: row.contactId,
    name,
    title: row.contact.title,
    personaId: null,
    personaName: null,
  };
}

function stageHasSavedNotes(
  stage: StageView,
  notesByContactId: Map<string, Array<{ stageId: string | null; text: string }>>,
): boolean {
  if (stage.notesBefore?.trim() || stage.notesAfter?.trim()) return true;
  for (const notes of notesByContactId.values()) {
    if (notes.some((note) => note.stageId === stage.id && note.text.trim())) return true;
  }
  return false;
}

function interviewsByPerson(stages: StageView[], people: PersonOption[]) {
  const groups = new Map<string, { person: PersonOption; interviews: StageView[] }>();
  const unlinked: StageView[] = [];
  for (const stage of stages) {
    if (stage.interviewers.length === 0) {
      unlinked.push(stage);
      continue;
    }
    for (const row of stage.interviewers) {
      const person = personForInterviewer(row, people);
      const group = groups.get(person.contactId) ?? { person, interviews: [] };
      group.interviews.push(stage);
      groups.set(person.contactId, group);
    }
  }
  const ordered = [...groups.values()].map((group) => ({
    person: group.person,
    interviews: [...group.interviews].sort(compareNewest),
  }));
  ordered.sort((left, right) => {
    const byDate = compareNewest(left.interviews[0]!, right.interviews[0]!);
    if (byDate !== 0) return byDate;
    return (
      left.person.name.localeCompare(right.person.name) ||
      left.person.contactId.localeCompare(right.person.contactId)
    );
  });
  unlinked.sort(compareNewest);
  return { people: ordered, unlinked };
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
  cheatSheetNotes: Array<{ id: string; text: string; createdAt: string }>;
  expectedDecisionAt: Date | null;
  canEdit: boolean;
  campaignId: string;
}) {
  const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";
  const before = notesBefore?.trim() ?? "";
  const after = notesAfter?.trim() ?? "";
  const savedNotes = [...cheatSheetNotes].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );
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
      {expectedDecisionAt ? (
        <p className="text-sm text-ink" data-testid={`saved-expected-decision-${stageId}-${contactId ?? "stage"}`}>
          <span className="font-medium">{interviewConfig.labels.savedExpectedDecision}</span>
          <span className="mt-1 block">{dateLabel(expectedDecisionAt)}</span>
        </p>
      ) : null}
      {canEdit && contactId ? (
        <CheatSheetNoteForm
          campaignId={campaignId}
          stageId={stageId}
          contactId={contactId}
          fieldClass={fieldClass}
          notes={savedNotes}
        />
      ) : (
        <SavedInterviewNotes stageId={stageId} contactId={contactId} notes={savedNotes} />
      )}
    </div>
  );
}

function PersonInterview({
  campaignId,
  stage,
  contactId,
  notesByContactId,
  canEdit,
  fieldClass,
}: {
  campaignId: string;
  stage: StageView;
  contactId: string | null;
  notesByContactId: Map<string, ReturnType<typeof parseCheatSheetNotes>>;
  canEdit: boolean;
  fieldClass: string;
}) {
  const gained = contactId
    ? (notesByContactId.get(contactId) ?? []).filter((note) => note.stageId === stage.id)
    : [];
  return (
    <article
      className="space-y-3 border-t border-edge pt-4"
      data-testid={
        contactId ? `person-interview-${contactId}-${stage.id}` : `unlinked-interview-${stage.id}`
      }
    >
      <dl className="grid gap-2 text-sm text-ink sm:grid-cols-3">
        <div>
          <dt className="font-medium">Type</dt>
          <dd>{stageTypeLabel(stage.type)}</dd>
        </div>
        <div>
          <dt className="font-medium">Date and time</dt>
          <dd>{stage.scheduledAt.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="font-medium">Format</dt>
          <dd>{interviewConfig.formats[stage.format]}</dd>
        </div>
      </dl>
      <div className="space-y-3">
        <p className="text-sm text-ink">
          <span className="font-medium">{interviewConfig.labels.outcome}</span>
          <span className="mt-1 block">
            {stage.outcome
              ? interviewConfig.outcomes[stage.outcome]
              : interviewConfig.labels.noOutcome}
          </span>
        </p>
        {canEdit ? (
          <ApplicationActionForm
            action={updateInterviewStageAction}
            submitLabel={interviewConfig.labels.saveStage}
            testId={`update-stage-${stage.id}-${contactId ?? "unlinked"}`}
            formClassName="flex flex-col gap-3"
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="stageId" value={stage.id} />
            <label className="block text-sm">
              {interviewConfig.labels.outcome}
              <select name="outcome" className={fieldClass} defaultValue={stage.outcome ?? ""}>
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
      </div>
      <StageStoredNotes
        campaignId={campaignId}
        stageId={stage.id}
        contactId={contactId}
        notesBefore={stage.notesBefore}
        notesAfter={stage.notesAfter}
        cheatSheetNotes={gained}
        expectedDecisionAt={stage.expectedDecisionAt}
        canEdit={canEdit && Boolean(contactId)}
      />
      {canEdit ? (
        <RemoveInterviewControl
          campaignId={campaignId}
          stageId={stage.id}
          contactId={contactId}
          hasNotes={stageHasSavedNotes(stage, notesByContactId)}
        />
      ) : null}
    </article>
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
  const grouped = interviewsByPerson(stages, people);
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
        <AddSomeoneYoureMeeting
          campaignId={campaignId}
          roles={roles}
          people={people}
          fieldClass={fieldClass}
        />
      ) : null}

      {grouped.people.map((group) => {
        const startOpen = group.interviews.length === 1 && group.interviews[0]?.outcome == null;
        return (
          <InterviewerCollapsible
            key={group.person.contactId}
            title={group.person.name}
            startOpen={startOpen}
            testId={`person-section-${group.person.contactId}`}
            headingAside={
              <InterviewStageInterviewerLink campaignId={campaignId} person={group.person} />
            }
          >
            {group.interviews.map((stage) => (
              <PersonInterview
                key={stage.id}
                campaignId={campaignId}
                stage={stage}
                contactId={group.person.contactId}
                notesByContactId={notesByContactId}
                canEdit={canEdit}
                fieldClass={fieldClass}
              />
            ))}
            {canEdit ? (
              <AddFollowUpInterview
                campaignId={campaignId}
                contactId={group.person.contactId}
                fieldClass={fieldClass}
              />
            ) : null}
          </InterviewerCollapsible>
        );
      })}

      {grouped.unlinked.length > 0 ? (
        <section className="space-y-4" data-testid="interviews-not-linked">
          <h3 className="text-sm font-medium text-ink">
            {interviewConfig.labels.notLinkedToAnyone}
          </h3>
          {grouped.unlinked.map((stage) => (
            <PersonInterview
              key={stage.id}
              campaignId={campaignId}
              stage={stage}
              contactId={null}
              notesByContactId={notesByContactId}
              canEdit={canEdit}
              fieldClass={fieldClass}
            />
          ))}
        </section>
      ) : null}

      {stages.length === 0 ? (
        <p className="text-sm text-subtle">No stages yet.</p>
      ) : null}
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

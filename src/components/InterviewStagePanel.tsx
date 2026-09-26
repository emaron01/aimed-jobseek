import {
  addCheatSheetInterviewNoteAction,
  addInterviewInterviewerAction,
  assignExistingInterviewerAction,
} from "@/app/actions/interview";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { CheatSheetPersonBody } from "@/components/CheatSheetPersonBody";
import type { CheatSheetNote } from "@/lib/application-summary/notes";
import type { CheatSheetPersonSection } from "@/lib/application-summary/contract";
import { interviewConfig, outreachConfig, vocab } from "@/lib/product-config";

type RoleOption = { id: string; name: string };
type PersonOption = {
  contactId: string;
  name: string;
  title: string | null;
  personaId: string | null;
  personaName: string | null;
};

export function InterviewStagePanel({
  campaignId,
  canEdit,
  stageId,
  interviewerContactId,
  people,
  roles,
  heading,
  sectionKey,
  section,
  notes,
}: {
  campaignId: string;
  canEdit: boolean;
  stageId: string;
  interviewerContactId: string | null;
  people: PersonOption[];
  roles: RoleOption[];
  heading: string;
  sectionKey: string | null;
  section: CheatSheetPersonSection | null;
  notes: CheatSheetNote[];
}) {
  const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";
  const interviewer = people.find((person) => person.contactId === interviewerContactId);

  return (
    <div className="space-y-4" data-testid={`interview-stage-panel-${stageId}`}>
      <div>
        <h3 className="font-medium text-ink">{interviewConfig.labels.interviewer}</h3>
        {interviewer ? (
          <p className="mt-1 text-sm text-ink">
            {interviewer.name}
            {interviewer.title ? ` · ${interviewer.title}` : ""}
            {interviewer.personaName ? ` · ${interviewer.personaName}` : ""}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">{interviewConfig.labels.noInterviewer}</p>
        )}
      </div>

      {canEdit ? (
        <>
          {people.length > 0 ? (
            <ApplicationActionForm
              action={assignExistingInterviewerAction}
              submitLabel={interviewConfig.labels.useInterviewer}
              testId={`assign-interviewer-${stageId}`}
            >
              <input type="hidden" name="campaignId" value={campaignId} />
              <input type="hidden" name="stageId" value={stageId} />
              <label className="text-sm">
                {interviewConfig.labels.chooseInterviewer}
                <select
                  name="contactId"
                  required
                  className={fieldClass}
                  defaultValue={interviewerContactId ?? ""}
                >
                  <option value="">{interviewConfig.labels.chooseInterviewer}</option>
                  {people.map((person) => (
                    <option key={person.contactId} value={person.contactId}>
                      {person.name}
                      {person.title ? ` · ${person.title}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </ApplicationActionForm>
          ) : null}

          <details className="rounded-md border border-edge bg-canvas p-3">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              {interviewConfig.labels.addNewInterviewer}
            </summary>
            <div className="mt-3">
              <ApplicationActionForm
                action={addInterviewInterviewerAction}
                submitLabel={interviewConfig.labels.addInterviewer}
                testId={`add-interviewer-${stageId}`}
              >
                <input type="hidden" name="campaignId" value={campaignId} />
                <input type="hidden" name="stageId" value={stageId} />
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm">
                    {outreachConfig.labels.fieldFirstName}
                    <input name="firstName" required className={fieldClass} />
                  </label>
                  <label className="text-sm">
                    {outreachConfig.labels.fieldLastName}
                    <input name="lastName" required className={fieldClass} />
                  </label>
                  <label className="text-sm">
                    {outreachConfig.labels.fieldTitle}
                    <input name="title" required className={fieldClass} />
                  </label>
                  <label className="text-sm">
                    {vocab.persona.Singular}
                    <select name="personaId" required className={fieldClass}>
                      <option value="">{vocab.persona.Singular}</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    {outreachConfig.labels.fieldEmail}
                    <input name="email" type="email" className={fieldClass} />
                  </label>
                  <label className="text-sm">
                    {outreachConfig.labels.fieldLinkedIn}
                    <input name="linkedinUrl" className={fieldClass} />
                  </label>
                  <label className="text-sm md:col-span-2">
                    {outreachConfig.labels.pasteLinkedIn}
                    <textarea
                      name="linkedInProfileText"
                      rows={5}
                      className={fieldClass}
                    />
                    <span className="mt-1 block text-xs text-muted">
                      {outreachConfig.labels.pasteLinkedInHelp}
                    </span>
                  </label>
                </div>
              </ApplicationActionForm>
            </div>
          </details>
        </>
      ) : null}

      {sectionKey ? (
        <section className="application-summary-section rounded-lg border border-edge bg-surface p-5">
          <h3 className="text-lg font-semibold text-ink">{heading}</h3>
          <div className="mt-4">
            <CheatSheetPersonBody
              campaignId={campaignId}
              canEdit={canEdit}
              sectionKey={sectionKey}
              section={section}
              notes={notes}
            />
          </div>
        </section>
      ) : (
        <p className="text-sm text-muted">{interviewConfig.labels.noCheatSheetSection}</p>
      )}

      {canEdit && interviewerContactId ? (
        <ApplicationActionForm
          action={addCheatSheetInterviewNoteAction}
          submitLabel={interviewConfig.labels.addGainedInformation}
          testId={`add-cheat-sheet-note-${stageId}`}
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="stageId" value={stageId} />
          <input type="hidden" name="contactId" value={interviewerContactId} />
          <label className="text-sm">
            {interviewConfig.labels.gainedInformation}
            <textarea name="note" rows={4} required className={fieldClass} />
            <span className="mt-1 block text-xs text-muted">
              {interviewConfig.labels.gainedInformationHelp}
            </span>
          </label>
        </ApplicationActionForm>
      ) : null}
    </div>
  );
}

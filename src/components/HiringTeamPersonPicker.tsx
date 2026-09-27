import {
  addHiringTeamPersonAction,
  assignExistingHiringTeamPersonAction,
} from "@/app/actions/hiring-team";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { hiringTeamConfig, interviewConfig, outreachConfig } from "@/lib/product-config";

type PersonOption = {
  contactId: string;
  name: string;
  title: string | null;
};

export function HiringTeamPersonPicker({
  campaignId,
  personaId,
  people,
}: {
  campaignId: string;
  personaId: string;
  people: PersonOption[];
}) {
  const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";
  return (
    <div className="space-y-3" data-testid={`hiring-team-person-picker-${personaId}`}>
      {people.length > 0 ? (
        <ApplicationActionForm
          action={assignExistingHiringTeamPersonAction}
          submitLabel={interviewConfig.labels.useInterviewer}
          testId={`assign-person-${personaId}`}
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="personaId" value={personaId} />
          <label className="text-sm">
            {interviewConfig.labels.chooseInterviewer}
            <select name="contactId" required className={fieldClass}>
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
            action={addHiringTeamPersonAction}
            submitLabel={hiringTeamConfig.actions.addPerson}
            testId={`add-person-${personaId}`}
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="personaId" value={personaId} />
            <label className="block text-sm">
              <span className="font-medium text-ink">
                {outreachConfig.labels.fieldFirstName}
              </span>
              <input name="firstName" required className={fieldClass} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">
                {outreachConfig.labels.fieldLastName}
              </span>
              <input name="lastName" required className={fieldClass} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">
                {outreachConfig.labels.fieldTitle}
              </span>
              <input name="title" required className={fieldClass} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">
                {outreachConfig.labels.fieldEmail}
              </span>
              <input name="email" type="email" className={fieldClass} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">
                {outreachConfig.labels.fieldLinkedIn}
              </span>
              <input name="linkedinUrl" type="url" className={fieldClass} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">
                {outreachConfig.labels.pasteInterviewerProfile}
              </span>
              <textarea
                name="linkedInProfileText"
                rows={5}
                className={fieldClass}
              />
              <span className="mt-1 block text-xs text-muted">
                {outreachConfig.labels.pasteInterviewerProfileHelp}
              </span>
            </label>
          </ApplicationActionForm>
        </div>
      </details>
    </div>
  );
}

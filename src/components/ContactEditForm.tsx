import { updateApplicationContactAction } from "@/app/actions/contact-edit";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { outreachConfig, vocab } from "@/lib/product-config";

const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";

/** The Hiring Team role dropdown used when a person needs a persona. */
export function HiringTeamRoleField({
  roles,
  defaultValue = "",
  className = fieldClass,
}: {
  roles: Array<{ id: string; name: string }>;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <label className="text-sm md:col-span-2">
      <span className="font-medium text-ink">{outreachConfig.labels.assignRole}</span>
      <select
        name="personaId"
        required
        defaultValue={defaultValue}
        className={className}
      >
        <option value="" disabled>
          {roles.length === 0
            ? `No ${vocab.persona.plural} yet`
            : `Choose ${vocab.persona.aSingular}`}
        </option>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export type ContactEditFormValues = {
  contactId: string;
  campaignId: string | null;
  returnTo: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  linkedinUrl: string;
  personaId: string | null;
  pastedText: string;
  roles: Array<{ id: string; name: string }>;
};

export function ContactEditForm({ values }: { values: ContactEditFormValues }) {
  return (
    <ApplicationActionForm
      action={updateApplicationContactAction}
      submitLabel={outreachConfig.labels.saveContact}
      testId="contact-edit-form"
    >
      <input type="hidden" name="contactId" value={values.contactId} />
      {values.campaignId ? (
        <input type="hidden" name="campaignId" value={values.campaignId} />
      ) : null}
      <input type="hidden" name="returnTo" value={values.returnTo} />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium text-ink">{outreachConfig.labels.fieldFirstName}</span>
          <input
            name="firstName"
            required
            defaultValue={values.firstName}
            className={fieldClass}
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-ink">{outreachConfig.labels.fieldLastName}</span>
          <input
            name="lastName"
            required
            defaultValue={values.lastName}
            className={fieldClass}
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-ink">{outreachConfig.labels.fieldTitle}</span>
          <input
            name="title"
            required
            defaultValue={values.title}
            className={fieldClass}
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-ink">{outreachConfig.labels.fieldEmail}</span>
          <input
            name="email"
            type="email"
            defaultValue={values.email}
            className={fieldClass}
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="font-medium text-ink">{outreachConfig.labels.fieldLinkedIn}</span>
          <input
            name="linkedinUrl"
            defaultValue={values.linkedinUrl}
            className={fieldClass}
          />
        </label>
        {values.campaignId ? (
          <>
            <HiringTeamRoleField
              roles={values.roles}
              defaultValue={values.personaId ?? ""}
            />
            <label className="text-sm md:col-span-2">
              <span className="font-medium text-ink">
                {outreachConfig.labels.pasteInterviewerProfile}
              </span>
              <textarea
                name="linkedInProfileText"
                rows={8}
                defaultValue={values.pastedText}
                className={fieldClass}
              />
              <span className="mt-1 block text-xs text-muted">
                {outreachConfig.labels.pasteInterviewerProfileHelp}
              </span>
            </label>
          </>
        ) : null}
      </div>
    </ApplicationActionForm>
  );
}

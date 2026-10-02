import { workspaceHarperContactHref } from "@/lib/application/workspace-links";

type PersonOption = {
  contactId: string;
  name: string;
  title: string | null;
  personaName: string | null;
};

export function InterviewStageInterviewerLink({
  campaignId,
  person,
}: {
  campaignId: string;
  person: PersonOption;
}) {
  return (
    <p className="text-sm text-ink">
      <a
        href={workspaceHarperContactHref(campaignId, person.contactId)}
        className="font-medium text-ink underline decoration-ink underline-offset-2"
        data-testid={`harper-contact-link-${person.contactId}`}
      >
        {person.name}
      </a>
      {person.title ? <span> · {person.title}</span> : null}
      {person.personaName ? <span> · {person.personaName}</span> : null}
    </p>
  );
}

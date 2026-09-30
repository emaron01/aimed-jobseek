"use client";

import { useState } from "react";
import {
  addInterviewInterviewerAction,
  assignExistingInterviewerAction,
} from "@/app/actions/interview";
import { AppButton } from "@/components/AppButton";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { workspaceHarperContactHref } from "@/lib/application/workspace-links";
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
  interviewerContactIds,
  people,
  roles,
}: {
  campaignId: string;
  canEdit: boolean;
  stageId: string;
  interviewerContactId: string | null;
  interviewerContactIds?: string[];
  people: PersonOption[];
  roles: RoleOption[];
}) {
  const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";
  const assignedIds =
    interviewerContactIds && interviewerContactIds.length > 0
      ? interviewerContactIds
      : interviewerContactId
        ? [interviewerContactId]
        : [];
  const assigned = assignedIds
    .map((contactId) => people.find((person) => person.contactId === contactId))
    .filter((person): person is PersonOption => Boolean(person));
  const textLinkClass =
    "text-sm font-medium text-ink underline decoration-ink underline-offset-2";

  return (
    <div className="space-y-4" data-testid={`interview-stage-panel-${stageId}`}>
      <div>
        <h3 className="font-medium text-ink">{interviewConfig.labels.interviewer}</h3>
        {assigned.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {assigned.map((person) => (
              <li key={person.contactId} className="flex flex-wrap items-center gap-2">
                <a
                  href={workspaceHarperContactHref(campaignId, person.contactId)}
                  className={textLinkClass}
                  data-testid={`harper-contact-link-${person.contactId}`}
                >
                  {person.name}
                </a>
                {person.title ? (
                  <span className="text-sm text-ink">· {person.title}</span>
                ) : null}
                {person.personaName ? (
                  <span className="text-sm text-ink">· {person.personaName}</span>
                ) : null}
              </li>
            ))}
          </ul>
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
                    {outreachConfig.labels.pasteInterviewerProfile}
                    <textarea
                      name="linkedInProfileText"
                      rows={5}
                      className={fieldClass}
                    />
                    <span className="mt-1 block text-xs text-muted">
                      {outreachConfig.labels.pasteInterviewerProfileHelp}
                    </span>
                  </label>
                </div>
              </ApplicationActionForm>
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}

type PendingInterviewer = {
  key: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  linkedinUrl: string;
  linkedInProfileText: string;
  personaId: string;
};

/**
 * Optional interviewers on the create-stage form. They submit with the stage
 * and are assigned only; prep stays on Start interviewer prep.
 */
export function InterviewStageSetupInterviewers({
  people,
  roles,
}: {
  people: PersonOption[];
  roles: RoleOption[];
}) {
  const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";
  const [selectedId, setSelectedId] = useState("");
  const [chosenIds, setChosenIds] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingInterviewer[]>([]);
  const [draft, setDraft] = useState<Omit<PendingInterviewer, "key">>({
    firstName: "",
    lastName: "",
    title: "",
    email: "",
    linkedinUrl: "",
    linkedInProfileText: "",
    personaId: "",
  });
  const [draftError, setDraftError] = useState<string | null>(null);

  function addChosen() {
    if (!selectedId || chosenIds.includes(selectedId)) return;
    setChosenIds((current) => [...current, selectedId]);
    setSelectedId("");
  }

  function addPending() {
    if (!draft.firstName.trim()) {
      setDraftError("First name is required.");
      return;
    }
    if (!draft.lastName.trim()) {
      setDraftError("Last name is required.");
      return;
    }
    if (!draft.title.trim()) {
      setDraftError("Title is required.");
      return;
    }
    if (!draft.personaId.trim()) {
      setDraftError(`Choose ${vocab.persona.aSingular} for this interviewer.`);
      return;
    }
    setPending((current) => [
      ...current,
      { ...draft, key: `${current.length}-${draft.firstName}-${draft.lastName}` },
    ]);
    setDraft({
      firstName: "",
      lastName: "",
      title: "",
      email: "",
      linkedinUrl: "",
      linkedInProfileText: "",
      personaId: "",
    });
    setDraftError(null);
  }

  return (
    <div className="space-y-3 md:col-span-2" data-testid="stage-setup-interviewers">
      {chosenIds.map((contactId) => (
        <input key={contactId} type="hidden" name="contactId" value={contactId} />
      ))}
      {pending.map((person) => (
        <div key={person.key}>
          <input type="hidden" name="newInterviewerFirstName" value={person.firstName} />
          <input type="hidden" name="newInterviewerLastName" value={person.lastName} />
          <input type="hidden" name="newInterviewerTitle" value={person.title} />
          <input type="hidden" name="newInterviewerEmail" value={person.email} />
          <input type="hidden" name="newInterviewerLinkedinUrl" value={person.linkedinUrl} />
          <input type="hidden" name="newInterviewerProfileText" value={person.linkedInProfileText} />
          <input type="hidden" name="newInterviewerPersonaId" value={person.personaId} />
        </div>
      ))}
      {people.length > 0 ? (
        <div className="space-y-2">
          <label className="text-sm">
            {interviewConfig.labels.chooseInterviewer}
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className={fieldClass}
              data-testid="stage-setup-choose-interviewer"
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
          <AppButton
            type="button"
            variant="secondary"
            data-testid="stage-setup-use-interviewer"
            onClick={addChosen}
          >
            {interviewConfig.labels.useInterviewer}
          </AppButton>
          {chosenIds.length > 0 ? (
            <ul className="space-y-1 text-sm text-ink" data-testid="stage-setup-chosen">
              {chosenIds.map((contactId) => {
                const person = people.find((item) => item.contactId === contactId);
                return <li key={contactId}>{person?.name ?? contactId}</li>;
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
      <details className="rounded-md border border-edge bg-canvas p-3" data-testid="stage-setup-add-interviewer">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          {interviewConfig.labels.addNewInterviewer}
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              {outreachConfig.labels.fieldFirstName}
              <input
                value={draft.firstName}
                onChange={(event) => setDraft((current) => ({ ...current, firstName: event.target.value }))}
                className={fieldClass}
                data-testid="stage-setup-first-name"
              />
            </label>
            <label className="text-sm">
              {outreachConfig.labels.fieldLastName}
              <input
                value={draft.lastName}
                onChange={(event) => setDraft((current) => ({ ...current, lastName: event.target.value }))}
                className={fieldClass}
              />
            </label>
            <label className="text-sm">
              {outreachConfig.labels.fieldTitle}
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                className={fieldClass}
              />
            </label>
            <label className="text-sm">
              {vocab.persona.Singular}
              <select
                value={draft.personaId}
                onChange={(event) => setDraft((current) => ({ ...current, personaId: event.target.value }))}
                className={fieldClass}
              >
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
              <input
                value={draft.email}
                type="email"
                onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                className={fieldClass}
              />
            </label>
            <label className="text-sm">
              {outreachConfig.labels.fieldLinkedIn}
              <input
                value={draft.linkedinUrl}
                onChange={(event) => setDraft((current) => ({ ...current, linkedinUrl: event.target.value }))}
                className={fieldClass}
              />
            </label>
            <label className="text-sm md:col-span-2">
              {outreachConfig.labels.pasteInterviewerProfile}
              <textarea
                value={draft.linkedInProfileText}
                rows={5}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, linkedInProfileText: event.target.value }))
                }
                className={fieldClass}
              />
              <span className="mt-1 block text-xs text-muted">
                {outreachConfig.labels.pasteInterviewerProfileHelp}
              </span>
            </label>
          </div>
          {draftError ? (
            <p className="text-sm text-danger" role="alert">
              {draftError}
            </p>
          ) : null}
          <AppButton
            type="button"
            variant="secondary"
            data-testid="stage-setup-add-pending"
            onClick={addPending}
          >
            {interviewConfig.labels.addInterviewer}
          </AppButton>
          {pending.length > 0 ? (
            <ul className="space-y-1 text-sm text-ink" data-testid="stage-setup-pending">
              {pending.map((person) => (
                <li key={person.key}>
                  {person.firstName} {person.lastName}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { buildNewInterviewAction } from "@/app/actions/interview";
import { AppActionLink, AppButton, AppPendingIndicator } from "@/components/AppButton";
import { useWorkspaceJobResolution } from "@/components/workspace-jobs-context";
import {
  CREATE_ROLE_FROM_TITLE,
  matchingHiringTeamRoles,
} from "@/lib/application/role-title-match";
import {
  interviewConfig,
  interviewStageTypeForRole,
  prepGuideReadyMessage,
} from "@/lib/product-config";

const fieldClass =
  "mt-1 w-full rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm text-ink";

export type NewInterviewRoleOption = {
  id: string;
  name: string;
  suggestionKey: string | null;
  targetTitles: unknown;
};

export type NewInterviewContactOption = {
  contactId: string;
  name: string;
  title: string | null;
  personaName: string | null;
};

export function NewInterviewForm({
  campaignId,
  roles,
  contacts = [],
}: {
  campaignId: string;
  roles: NewInterviewRoleOption[];
  contacts?: NewInterviewContactOption[];
}) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<"existing" | "new">(
    contacts.length > 0 ? "existing" : "new",
  );
  const [contactId, setContactId] = useState(contacts[0]?.contactId ?? "");
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [format, setFormat] = useState("");
  const [stageType, setStageType] = useState("OTHER");
  const [typeTouched, setTypeTouched] = useState(false);
  const [personaChoice, setPersonaChoice] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<{
    contactId: string;
    sectionKey: string;
    displayName: string;
    jobId: string | null;
  } | null>(null);
  const lock = useRef(false);
  const { jobs, watchJobIds } = useWorkspaceJobResolution();

  const matches = matchingHiringTeamRoles({ title, roles });
  const single = matches.length === 1 ? matches[0]! : null;
  const choices = single ? [] : matches.length > 1 ? matches : roles;
  const selectedContact =
    contacts.find((contact) => contact.contactId === contactId) ?? null;
  const newRoleName =
    who === "new"
      ? single
        ? single.name
        : personaChoice === CREATE_ROLE_FROM_TITLE
          ? title
          : (roles.find((role) => role.id === personaChoice)?.name ?? "")
      : "";
  const suggestedType = interviewStageTypeForRole({
    roleName: who === "existing" ? (selectedContact?.personaName ?? "") : newRoleName,
    title: who === "existing" ? (selectedContact?.title ?? "") : title,
  });
  const displayedType = typeTouched ? stageType : suggestedType;

  useEffect(() => {
    if (!ready?.jobId) return;
    watchJobIds([ready.jobId]);
  }, [ready?.jobId, watchJobIds]);

  const job = ready?.jobId
    ? jobs.find((item) => item.id === ready.jobId || item.targetId === ready.sectionKey)
    : undefined;
  const guideFailed = job?.status === "FAILED";
  const showSpinner =
    working && !guideFailed && job?.status !== "COMPLETED";
  const showReady = Boolean(ready) && !guideFailed && !showSpinner;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current && !guideFailed) return;
    if (who === "existing" && !contactId) {
      setError(interviewConfig.labels.noInterviewer);
      return;
    }
    if (who === "new" && !single && !personaChoice) {
      setError(interviewConfig.labels.chooseRole);
      return;
    }
    const submitButton = event.currentTarget.querySelector(
      "[data-testid='new-interview-build']",
    );
    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;
    lock.current = true;
    setError(null);
    setReady(null);
    setWorking(true);
    const formData = new FormData();
    formData.set("campaignId", campaignId);
    formData.set("scheduledAt", scheduledAt);
    formData.set("format", format);
    formData.set("type", displayedType);
    if (who === "existing") {
      formData.set("contactId", contactId);
    } else {
      formData.set("title", title);
      formData.set("name", name);
      formData.set("personaId", single ? single.id : personaChoice);
    }
    const result = await buildNewInterviewAction(null, formData);
    if (!result.ok || !result.contactId || !result.sectionKey || !result.displayName) {
      setWorking(false);
      setError(result.message);
      lock.current = false;
      return;
    }
    setReady({
      contactId: result.contactId,
      sectionKey: result.sectionKey,
      displayName: result.displayName,
      jobId: result.jobId ?? null,
    });
    if (!result.jobId) setWorking(false);
  }

  function cancel() {
    setOpen(false);
    setError(null);
    setWorking(false);
    setReady(null);
    lock.current = false;
  }

  return (
    <div data-testid="new-interview">
      {open ? null : (
        <div className="flex justify-center">
          <AppButton
            type="button"
            variant="lightOrange"
            size="cta"
            className="shrink-0"
            data-testid="new-interview-open"
            onClick={() => setOpen(true)}
          >
            {interviewConfig.labels.newInterview}
          </AppButton>
        </div>
      )}
      {open ? (
        <div
          className="rounded-md border border-edge bg-surface p-4"
          data-testid="new-interview-panel"
        >
          {showReady && ready ? (
            <div className="space-y-3" data-testid="new-interview-ready">
              <p className="text-sm text-ink">
                {prepGuideReadyMessage(ready.displayName)}
              </p>
              <AppActionLink
                href={`/campaigns/${campaignId}/summary#${ready.sectionKey}`}
                variant="primary"
                data-testid="new-interview-view-guide"
              >
                {interviewConfig.labels.viewGuide}
              </AppActionLink>
            </div>
          ) : (
            <form className="space-y-3" onSubmit={onSubmit} data-testid="new-interview-form">
              {showSpinner ? (
                <AppPendingIndicator label={interviewConfig.labels.preparingGuide} />
              ) : (
              <>
              <p className="text-sm font-medium text-ink">
                {interviewConfig.labels.newInterviewCongratulations}
              </p>
              <fieldset className="space-y-2" data-testid="new-interview-who">
                <legend className="text-sm font-medium text-ink">Who</legend>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name="who"
                    checked={who === "existing"}
                    onChange={() => {
                      setWho("existing");
                      setTypeTouched(false);
                    }}
                    data-testid="new-interview-who-existing"
                  />
                  {interviewConfig.labels.someoneAlreadyOnApplication}
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name="who"
                    checked={who === "new"}
                    onChange={() => {
                      setWho("new");
                      setTypeTouched(false);
                    }}
                    data-testid="new-interview-who-new"
                  />
                  {interviewConfig.labels.aNewPerson}
                </label>
              </fieldset>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {who === "existing" ? (
                  <label className="block text-sm text-ink sm:col-span-2">
                    {interviewConfig.labels.someoneAlreadyOnApplication}
                    <select
                      required
                      value={contactId}
                      onChange={(event) => {
                        setContactId(event.target.value);
                        setTypeTouched(false);
                      }}
                      className={fieldClass}
                      data-testid="new-interview-person"
                    >
                      <option value="">{interviewConfig.labels.noInterviewer}</option>
                      {contacts.map((contact) => (
                        <option key={contact.contactId} value={contact.contactId}>
                          {contact.name}
                          {contact.title ? ` · ${contact.title}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {who === "new" ? (
                <>
                <label className="block text-sm text-ink sm:col-span-2">
                  {interviewConfig.labels.theirTitle}
                  <input
                    required
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className={fieldClass}
                    data-testid="new-interview-title"
                  />
                </label>
                {single ? (
                  <p className="text-sm text-muted sm:col-span-2" data-testid="new-interview-match">
                    {interviewConfig.labels.matchedRole}: {single.name}
                  </p>
                ) : (
                  <label className="block text-sm text-ink sm:col-span-2">
                    {interviewConfig.labels.chooseRole}
                    <select
                      required
                      value={personaChoice}
                      onChange={(event) => setPersonaChoice(event.target.value)}
                      className={fieldClass}
                      data-testid="new-interview-role"
                    >
                      <option value="">{interviewConfig.labels.chooseRole}</option>
                      {choices.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                      <option value={CREATE_ROLE_FROM_TITLE}>
                        {interviewConfig.labels.createRoleFromTitle}
                      </option>
                    </select>
                  </label>
                )}
                <label className="block text-sm text-ink sm:col-span-2">
                  {interviewConfig.labels.theirName}
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className={fieldClass}
                    data-testid="new-interview-name"
                  />
                </label>
                </>
                ) : null}
                <label className="block text-sm text-ink">
                  {interviewConfig.labels.interviewType}
                  <select
                    value={displayedType}
                    onChange={(event) => {
                      setTypeTouched(true);
                      setStageType(event.target.value);
                    }}
                    className={fieldClass}
                    data-testid="new-interview-type"
                  >
                    {Object.entries(interviewConfig.types).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-ink">
                  {interviewConfig.labels.interviewWhen}
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    className={fieldClass}
                    data-testid="new-interview-when"
                  />
                </label>
                <label className="block text-sm text-ink">
                  {interviewConfig.labels.interviewFormat}
                  <select
                    value={format}
                    onChange={(event) => setFormat(event.target.value)}
                    className={fieldClass}
                    data-testid="new-interview-format"
                  >
                    <option value="">{interviewConfig.labels.interviewFormat}</option>
                    {Object.entries(interviewConfig.formats).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <p
                  className="text-sm text-muted sm:col-span-2"
                  data-testid="new-interview-schedule-hint"
                >
                  {interviewConfig.labels.scheduleLaterHint}
                </p>
              </div>
              {error || guideFailed ? (
                <p className="text-sm text-danger" data-testid="new-interview-error">
                  {error ?? job?.error ?? "The prep guide could not be prepared. Retry."}
                </p>
              ) : null}
              </>
              )}
              <div className="flex flex-wrap gap-2">
                <AppButton
                  type="submit"
                  variant="primary"
                  disabled={working}
                  data-testid="new-interview-build"
                >
                  {interviewConfig.labels.buildMyPrepGuide}
                </AppButton>
                <AppButton type="button" variant="secondary" onClick={cancel}>
                  {interviewConfig.labels.cancelNewInterview}
                </AppButton>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}

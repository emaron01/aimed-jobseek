"use client";

import {
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  addCheatSheetInterviewNoteAction,
  removeInterviewAction,
} from "@/app/actions/interview";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { AppButton } from "@/components/AppButton";
import { CHEAT_SHEET_HEADING_CLASS } from "@/lib/application-summary/cheat-sheet-collapse";
import { formatSavedInterviewNoteAt } from "@/lib/interview/saved-note-label";
import { interviewConfig } from "@/lib/product-config";

export function SavedInterviewNotes({
  stageId,
  contactId,
  notes,
}: {
  stageId: string;
  contactId: string | null;
  notes: Array<{ id: string; text: string; createdAt: string }>;
}) {
  if (notes.length === 0) return null;
  return (
    <ul className="space-y-3" data-testid={`saved-notes-${stageId}-${contactId ?? "stage"}`}>
      {notes.map((note) => (
        <li key={note.id} className="text-sm text-ink" data-testid={`stored-gained-note-${note.id}`}>
          <time
            dateTime={note.createdAt}
            className="block font-medium"
            data-testid={`stored-gained-note-when-${note.id}`}
          >
            {formatSavedInterviewNoteAt(note.createdAt)}
          </time>
          <span className="mt-1 block whitespace-pre-wrap">{note.text}</span>
        </li>
      ))}
    </ul>
  );
}

function OutcomeSelect({
  fieldClass,
  outcome,
  disabled = false,
}: {
  fieldClass: string;
  outcome: string | null;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm">
      {interviewConfig.labels.outcome}
      <select
        name="outcome"
        className={fieldClass}
        defaultValue={outcome ?? ""}
        disabled={disabled}
      >
        <option value="">{interviewConfig.labels.noOutcome}</option>
        {Object.entries(interviewConfig.outcomes).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CheatSheetNoteForm({
  campaignId,
  stageId,
  contactId,
  fieldClass,
  outcome,
  labelId,
}: {
  campaignId: string;
  stageId: string;
  contactId: string | null;
  fieldClass: string;
  outcome: string | null;
  labelId: string;
}) {
  const formRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={formRef}>
    <ApplicationActionForm
      action={addCheatSheetInterviewNoteAction}
      submitLabel={interviewConfig.labels.addGainedInformation}
      testId={
        contactId
          ? `add-cheat-sheet-note-${stageId}-${contactId}`
          : `add-cheat-sheet-note-${stageId}-unlinked`
      }
      onSuccess={() => {
        const note = formRef.current?.querySelector("textarea[name=note]");
        if (note instanceof HTMLTextAreaElement) note.value = "";
      }}
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="stageId" value={stageId} />
      {contactId ? <input type="hidden" name="contactId" value={contactId} /> : null}
      <OutcomeSelect fieldClass={fieldClass} outcome={outcome} />
      {contactId ? (
        <label className="block text-sm">
          <textarea
            name="note"
            rows={4}
            aria-labelledby={labelId}
            className={fieldClass}
          />
        </label>
      ) : null}
    </ApplicationActionForm>
    </div>
  );
}

export function ReadOnlyOutcome({
  fieldClass,
  outcome,
}: {
  fieldClass: string;
  outcome: string | null;
}) {
  return <OutcomeSelect fieldClass={fieldClass} outcome={outcome} disabled />;
}

function subscribeLocationHash(onStoreChange: () => void): () => void {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function readLocationHash(): string {
  return window.location.hash;
}

function locationHashMatches(hash: string, testId: string): boolean {
  const raw = hash.replace(/^#/, "");
  if (!raw) return false;
  try {
    return decodeURIComponent(raw) === testId;
  } catch {
    return raw === testId;
  }
}

export function InterviewerCollapsible({
  title,
  startOpen,
  testId,
  titleTestId,
  headingAside,
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  title: string;
  startOpen: boolean;
  testId: string;
  titleTestId?: string;
  headingAside?: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(startOpen);
  const [hashDismissed, setHashDismissed] = useState(false);
  const hash = useSyncExternalStore(subscribeLocationHash, readLocationHash, () => "");
  const openedByHash =
    controlledOpen === undefined && !hashDismissed && locationHashMatches(hash, testId);
  const open = controlledOpen ?? (uncontrolledOpen || openedByHash);
  function toggle() {
    const next = !open;
    if (controlledOpen === undefined) {
      setUncontrolledOpen(next);
      setHashDismissed(!next);
    }
    onOpenChange?.(next);
  }
  return (
    <div id={testId} data-testid={testId} data-open={open ? "true" : "false"}>
      <AppButton
        type="button"
        variant="secondary"
        className={CHEAT_SHEET_HEADING_CLASS}
        aria-expanded={open}
        data-testid={`${testId}-toggle`}
        onClick={toggle}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-primary">
          <span
            aria-hidden="true"
            className="inline-block text-primary"
            data-cheat-sheet-indicator={open ? "open" : "collapsed"}
          >
            {open ? "▼" : "▶"}
          </span>
          <span data-testid={titleTestId}>{title}</span>
        </span>
      </AppButton>
      {headingAside ? <div className="mt-2">{headingAside}</div> : null}
      {open ? <div className="mt-3 space-y-3">{children}</div> : null}
    </div>
  );
}

export function RemoveInterviewControl({
  campaignId,
  stageId,
  contactId,
  hasNotes,
}: {
  campaignId: string;
  stageId: string;
  contactId: string | null;
  hasNotes: boolean;
}) {
  const [open, setOpen] = useState(false);
  const testId = `remove-interview-${stageId}-${contactId ?? "unlinked"}`;
  const message = hasNotes
    ? interviewConfig.labels.removeInterviewConfirmWithNotes
    : interviewConfig.labels.removeInterviewConfirmPlain;
  if (!open) {
    return (
      <AppButton
        type="button"
        variant="secondary"
        data-testid={testId}
        onClick={() => setOpen(true)}
      >
        {interviewConfig.labels.removeInterview}
      </AppButton>
    );
  }
  return (
    <div className="space-y-3" data-testid={`${testId}-confirm`}>
      <p className="text-sm text-ink" data-testid={`${testId}-message`}>
        {message}
      </p>
      <ApplicationActionForm
        action={removeInterviewAction}
        submitLabel={interviewConfig.labels.removeInterview}
        variant="secondary"
        testId={`${testId}-submit`}
      >
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="hidden" name="stageId" value={stageId} />
        {contactId ? <input type="hidden" name="contactId" value={contactId} /> : null}
      </ApplicationActionForm>
      <AppButton
        type="button"
        variant="secondary"
        data-testid={`${testId}-cancel`}
        onClick={() => setOpen(false)}
      >
        {interviewConfig.labels.removeInterviewCancel}
      </AppButton>
    </div>
  );
}

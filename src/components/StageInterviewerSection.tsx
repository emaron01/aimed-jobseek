"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { addApplicationContactAction } from "@/app/actions/application-outreach";
import {
  addCheatSheetInterviewNoteAction,
  createInterviewStageAction,
  removeInterviewAction,
} from "@/app/actions/interview";
import { AddContactForm } from "@/components/ApplicationOutreachSections";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { AppButton } from "@/components/AppButton";
import { CHEAT_SHEET_HEADING_CLASS } from "@/lib/application-summary/cheat-sheet-collapse";
import { formatSavedInterviewNoteAt } from "@/lib/interview/saved-note-label";
import { interviewConfig } from "@/lib/product-config";

type RoleOption = { id: string; name: string; suggestionKey?: string | null };
type PersonOption = {
  contactId: string;
  name: string;
  title: string | null;
};

export function StageAddContactForm({
  campaignId,
  roles,
}: {
  campaignId: string;
  roles: Array<{ id: string; name: string; campaignId?: string | null }>;
}) {
  const [, action] = useActionState(addApplicationContactAction, null);
  return (
    <AddContactForm campaignId={campaignId} roles={roles} action={action} />
  );
}

const ADD_SOMEONE_FORM_ID = "add-someone-interview";

function ScheduleFields({ fieldClass }: { fieldClass: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
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
  );
}

export function AddSomeoneYoureMeeting({
  campaignId,
  roles,
  people,
  fieldClass,
}: {
  campaignId: string;
  roles: RoleOption[];
  people: PersonOption[];
  fieldClass: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <InterviewerCollapsible
      title={interviewConfig.labels.addSomeoneYoureMeeting}
      startOpen={false}
      open={open}
      onOpenChange={setOpen}
      testId="add-someone-youre-meeting"
      titleTestId="stage-create-start"
    >
      <label className="block text-sm">
        {interviewConfig.labels.interviewer}
        <select
          name="contactId"
          form={ADD_SOMEONE_FORM_ID}
          required
          className={fieldClass}
          defaultValue=""
        >
          <option value="">{interviewConfig.labels.noInterviewer}</option>
          {people.map((person) => (
            <option key={person.contactId} value={person.contactId}>
              {person.name}
              {person.title ? ` · ${person.title}` : ""}
            </option>
          ))}
        </select>
      </label>
      <InterviewerCollapsible
        title={interviewConfig.labels.addNewContact}
        startOpen={false}
        testId="add-new-contact"
      >
        <StageAddContactForm campaignId={campaignId} roles={roles} />
      </InterviewerCollapsible>
      <ApplicationActionForm
        action={createInterviewStageAction}
        submitLabel={interviewConfig.labels.addStage}
        testId="add-interview-stage"
        formId={ADD_SOMEONE_FORM_ID}
        onSuccess={() => setOpen(false)}
      >
        <input type="hidden" name="campaignId" value={campaignId} />
        <ScheduleFields fieldClass={fieldClass} />
      </ApplicationActionForm>
    </InterviewerCollapsible>
  );
}

export function AddFollowUpInterview({
  campaignId,
  contactId,
  fieldClass,
}: {
  campaignId: string;
  contactId: string;
  fieldClass: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <InterviewerCollapsible
      title={interviewConfig.labels.addFollowUpInterview}
      startOpen={false}
      open={open}
      onOpenChange={setOpen}
      testId={`add-follow-up-${contactId}`}
    >
      <ApplicationActionForm
        action={createInterviewStageAction}
        submitLabel={interviewConfig.labels.addFollowUpInterviewSubmit}
        testId={`add-another-interview-${contactId}`}
        onSuccess={() => setOpen(false)}
      >
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="hidden" name="contactId" value={contactId} />
        <ScheduleFields fieldClass={fieldClass} />
      </ApplicationActionForm>
    </InterviewerCollapsible>
  );
}

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
    <ul className="mb-3 mt-2 space-y-3" data-testid={`saved-notes-${stageId}-${contactId ?? "stage"}`}>
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

export function CheatSheetNoteForm({
  campaignId,
  stageId,
  contactId,
  fieldClass,
  notes,
}: {
  campaignId: string;
  stageId: string;
  contactId: string;
  fieldClass: string;
  notes: Array<{ id: string; text: string; createdAt: string }>;
}) {
  const formRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={formRef}>
    <ApplicationActionForm
      action={addCheatSheetInterviewNoteAction}
      submitLabel={interviewConfig.labels.addGainedInformation}
      testId={`add-cheat-sheet-note-${stageId}-${contactId}`}
      onSuccess={() => formRef.current?.querySelector("form")?.reset()}
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="stageId" value={stageId} />
      <input type="hidden" name="contactId" value={contactId} />
      <label className="block text-sm">
        {interviewConfig.labels.gainedInformation}
        <SavedInterviewNotes stageId={stageId} contactId={contactId} notes={notes} />
        <textarea name="note" rows={4} required className={fieldClass} />
      </label>
    </ApplicationActionForm>
    </div>
  );
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
  const open = controlledOpen ?? uncontrolledOpen;
  function toggle() {
    const next = !open;
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }
  return (
    <div data-testid={testId} data-open={open ? "true" : "false"}>
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

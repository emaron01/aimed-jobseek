"use client";

import { useActionState, useState, type ReactNode } from "react";
import { addApplicationContactAction } from "@/app/actions/application-outreach";
import { removeInterviewAction } from "@/app/actions/interview";
import { AddContactForm } from "@/components/ApplicationOutreachSections";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { AppButton } from "@/components/AppButton";
import { CHEAT_SHEET_HEADING_CLASS } from "@/lib/application-summary/cheat-sheet-collapse";
import { interviewConfig } from "@/lib/product-config";

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

export function InterviewerCollapsible({
  title,
  startOpen,
  testId,
  headingAside,
  children,
}: {
  title: string;
  startOpen: boolean;
  testId: string;
  headingAside?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div data-testid={testId} data-open={open ? "true" : "false"}>
      <AppButton
        type="button"
        variant="secondary"
        className={CHEAT_SHEET_HEADING_CLASS}
        aria-expanded={open}
        data-testid={`${testId}-toggle`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-primary">
          <span
            aria-hidden="true"
            className="inline-block text-primary"
            data-cheat-sheet-indicator={open ? "open" : "collapsed"}
          >
            {open ? "▼" : "▶"}
          </span>
          {title}
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

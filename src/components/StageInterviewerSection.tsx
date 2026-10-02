"use client";

import { useActionState, useState, type ReactNode } from "react";
import { addApplicationContactAction } from "@/app/actions/application-outreach";
import { AddContactForm } from "@/components/ApplicationOutreachSections";
import { AppButton } from "@/components/AppButton";
import { CHEAT_SHEET_HEADING_CLASS } from "@/lib/application-summary/cheat-sheet-collapse";

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
  children,
}: {
  title: string;
  startOpen: boolean;
  testId: string;
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
      {open ? <div className="mt-3 space-y-3">{children}</div> : null}
    </div>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import { AppButton } from "@/components/AppButton";
import { CHEAT_SHEET_HEADING_CLASS } from "@/lib/application-summary/cheat-sheet-collapse";

export function HiringTeamReviewGroup({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section
      className="space-y-3"
      data-testid={testId}
      data-review-group={title}
      data-review-group-open={open ? "true" : "false"}
    >
      <AppButton
        type="button"
        variant="secondary"
        className={CHEAT_SHEET_HEADING_CLASS}
        aria-expanded={open}
        data-testid={`${testId}-heading`}
        onClick={() => setOpen((current) => !current)}
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
          <span
            aria-hidden="true"
            className="inline-block text-primary"
            data-review-indicator={open ? "open" : "collapsed"}
          >
            {open ? "▼" : "▶"}
          </span>
          {title}
        </h3>
      </AppButton>
      {open ? <div className="space-y-5">{children}</div> : null}
    </section>
  );
}

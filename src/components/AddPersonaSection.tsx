"use client";

import { useState } from "react";
import { addApplicationRoleAction } from "@/app/actions/hiring-team";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { AppButton } from "@/components/AppButton";
import { CHEAT_SHEET_HEADING_CLASS } from "@/lib/application-summary/cheat-sheet-collapse";
import { hiringTeamConfig } from "@/lib/product-config";

const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";

export function AddPersonaSection({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="add-persona-section" data-open={open ? "true" : "false"}>
      <AppButton
        type="button"
        variant="secondary"
        className={CHEAT_SHEET_HEADING_CLASS}
        aria-expanded={open}
        data-testid="add-persona-toggle"
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
          {hiringTeamConfig.addPersonaTitle}
        </span>
      </AppButton>
      {open ? (
        <div className="mt-4 space-y-3" data-testid="add-persona-body">
          <p className="text-sm text-muted">
            Saved templates are added only when you choose one.
          </p>
          <ApplicationActionForm
            action={addApplicationRoleAction}
            submitLabel={hiringTeamConfig.addPersonaSubmit}
            testId="add-hiring-team-role"
            onSuccess={() => setOpen(false)}
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <label className="block text-sm">
              <span className="font-medium text-ink">Name</span>
              <input name="name" required className={fieldClass} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">Likely titles</span>
              <textarea name="likelyTitles" rows={3} className={fieldClass} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">Department</span>
              <input name="department" className={fieldClass} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">Why this role matters</span>
              <textarea name="whyThisRoleMatters" rows={2} className={fieldClass} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">Notes</span>
              <textarea name="notes" rows={2} className={fieldClass} />
            </label>
          </ApplicationActionForm>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { AppButton } from "@/components/AppButton";
import { hiringTeamConfig } from "@/lib/product-config";

type ActionResult = { ok: boolean; message: string };

export function HiringTeamRoleActions({
  campaignId,
  personaId,
  buildAction,
  buildLabel,
  editForm,
}: {
  campaignId: string;
  personaId: string;
  buildAction: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  buildLabel: string;
  editForm: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-3 print:hidden">
      <div className="flex flex-wrap gap-2">
        <AppButton
          type="button"
          variant="secondary"
          data-testid={`edit-role-${personaId}`}
          onClick={() => setEditing((open) => !open)}
        >
          {hiringTeamConfig.actions.edit}
        </AppButton>
        <ApplicationActionForm
          action={buildAction}
          submitLabel={buildLabel}
          testId={`build-role-${personaId}`}
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="personaId" value={personaId} />
        </ApplicationActionForm>
      </div>
      {editing ? editForm : null}
    </div>
  );
}

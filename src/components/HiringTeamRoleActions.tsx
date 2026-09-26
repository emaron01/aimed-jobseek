"use client";

import { useState, type ReactNode } from "react";
import { AppButton } from "@/components/AppButton";
import { hiringTeamConfig } from "@/lib/product-config";

export function HiringTeamRoleActions({
  personaId,
  editForm,
  addPersonForm,
}: {
  personaId: string;
  editForm: ReactNode;
  addPersonForm: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [addingPerson, setAddingPerson] = useState(false);
  return (
    <div className="space-y-3 print:hidden">
      <div
        className="flex flex-wrap justify-end gap-2"
        data-testid={`persona-card-actions-${personaId}`}
      >
        <AppButton
          type="button"
          variant="secondary"
          data-testid={`edit-role-${personaId}`}
          onClick={() => {
            setEditing((open) => !open);
            setAddingPerson(false);
          }}
        >
          {hiringTeamConfig.actions.edit}
        </AppButton>
        <AppButton
          type="button"
          variant="secondary"
          data-testid={`know-who-interviewing-${personaId}`}
          onClick={() => {
            setAddingPerson((open) => !open);
            setEditing(false);
          }}
        >
          {hiringTeamConfig.actions.knowWhoInterviewing}
        </AppButton>
      </div>
      {editing ? editForm : null}
      {addingPerson ? (
        <div data-testid={`add-person-panel-${personaId}`}>
          <h5 className="text-sm font-semibold text-ink">
            {hiringTeamConfig.addPersonTitle}
          </h5>
          <div className="mt-3">{addPersonForm}</div>
        </div>
      ) : null}
    </div>
  );
}

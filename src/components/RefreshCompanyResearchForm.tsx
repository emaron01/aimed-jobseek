"use client";
import { SECONDARY_BUTTON_CLASS, AppButton } from "@/components/ui";

import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import { refreshCompanyResearchAction } from "@/app/actions/research";

export function RefreshCompanyResearchForm({
  companyId,
  contactListId,
  label = "Refresh Research",
}: {
  companyId: string;
  contactListId?: string;
  label?: string;
}) {
  return (
    <ActionFeedbackForm action={refreshCompanyResearchAction}>
      <input type="hidden" name="companyId" value={companyId} />
      {contactListId ? (
        <input type="hidden" name="contactListId" value={contactListId} />
      ) : null}
      <AppButton
        type="submit"
        className={SECONDARY_BUTTON_CLASS}
      >
        {label}
      </AppButton>
    </ActionFeedbackForm>
  );
}

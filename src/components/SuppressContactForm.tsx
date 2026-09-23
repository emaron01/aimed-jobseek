"use client";

import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import {
  releaseContactAction,
  suppressContactAction,
} from "@/app/actions/suppression";
import { suppressionOptOutConfirmBody } from "@/lib/suppression/confirm-copy";
import { vocab } from "@/lib/product-config";

export function SuppressContactForm({
  contactId,
  email,
  suppressed,
}: {
  contactId: string;
  email: string | null;
  suppressed: boolean;
}) {
  if (!email) {
    return (
      <p className="text-xs text-slate-500">Add an email to opt out.</p>
    );
  }

  if (suppressed) {
    return (
      <ConfirmDeleteForm
        action={releaseContactAction}
        hiddenFields={{ contactId }}
        triggerLabel={`Restore ${vocab.contact.singular}`}
        confirmTitle={`Restore ${email}?`}
        confirmBody="This removes the organization-wide suppression. The address can be scored and emailed again. Who restored it is recorded."
        confirmButtonLabel="Restore"
        tone="warning"
        pendingLabel="Restoring…"
      />
    );
  }

  return (
    <ConfirmDeleteForm
      action={suppressContactAction}
      hiddenFields={{ contactId }}
      triggerLabel="Opt out"
      confirmTitle={`Opt out ${email}?`}
      confirmBody={suppressionOptOutConfirmBody()}
      confirmButtonLabel="Opt out"
      tone="warning"
      pendingLabel="Saving…"
    />
  );
}

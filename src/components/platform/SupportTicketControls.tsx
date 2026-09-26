"use client";

import type { SupportTicketStatus } from "@prisma/client";
import {
  addSupportTicketNoteAction,
  updateSupportTicketStatusAction,
} from "@/app/actions/support";
import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import { SubmitButton } from "@/components/ui";

export function SupportTicketStatusForm({
  ticketId,
  status,
}: {
  ticketId: string;
  status: SupportTicketStatus;
}) {
  return (
    <ActionFeedbackForm
      action={updateSupportTicketStatusAction}
      className="flex flex-wrap items-end gap-3"
      testId="support-ticket-status-form"
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <label className="text-sm">
        <span className="block font-medium text-ink">Status</span>
        <select
          name="status"
          defaultValue={status}
          className="mt-1 rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm"
        >
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="CLOSED">Closed</option>
        </select>
      </label>
      <SubmitButton>Update status</SubmitButton>
    </ActionFeedbackForm>
  );
}

export function SupportTicketNoteForm({ ticketId }: { ticketId: string }) {
  return (
    <ActionFeedbackForm
      action={addSupportTicketNoteAction}
      className="space-y-3"
      testId="support-ticket-note-form"
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <label className="block text-sm">
        <span className="font-medium text-ink">Internal note</span>
        <textarea
          name="body"
          required
          maxLength={5000}
          rows={4}
          className="mt-1 w-full resize-y rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm text-ink outline-none ring-focus focus:ring-2"
        />
        <span className="mt-1 block text-xs text-subtle">
          Internal notes are never visible to the user.
        </span>
      </label>
      <SubmitButton>Add internal note</SubmitButton>
    </ActionFeedbackForm>
  );
}

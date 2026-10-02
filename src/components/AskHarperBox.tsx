"use client";

import { useState } from "react";
import { askHarperAction } from "@/app/actions/ask-harper";
import { AppButton } from "@/components/AppButton";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { QuestionList } from "@/components/ConsultationThread";
import { HarperDraftProvider } from "@/components/HarperDraftStore";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import { consultationConversationCopy } from "@/lib/product-config";

const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";

export function AskHarperBox({
  campaignId,
  canEdit,
  drafts,
}: {
  campaignId: string;
  canEdit: boolean;
  drafts: ConsultationQaItem[];
}) {
  const [open, setOpen] = useState(drafts.length > 0);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  return (
    <div className="space-y-3" data-testid="ask-harper">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xl font-bold text-ink" data-testid="ask-harper-line">
          {consultationConversationCopy.askHarperLine}
        </p>
        {canEdit ? (
          <AppButton
            type="button"
            variant="orange"
            data-testid="ask-harper-open"
            onClick={() => setOpen(true)}
          >
            {consultationConversationCopy.askHarperAction}
          </AppButton>
        ) : null}
      </div>
      {open && canEdit ? (
        <ApplicationActionForm
          action={askHarperAction}
          submitLabel={consultationConversationCopy.askHarperAction}
          pendingLabel={consultationConversationCopy.thinking}
          testId="ask-harper-form"
          variant="orange"
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <label className="block text-sm">
            <span className="sr-only">{consultationConversationCopy.askHarperAction}</span>
            <textarea
              name="question"
              required
              rows={3}
              className={fieldClass}
              data-testid="ask-harper-question"
            />
          </label>
        </ApplicationActionForm>
      ) : null}
      {drafts.length > 0 ? (
        <HarperDraftProvider>
          <div className="space-y-3" data-testid="ask-harper-drafts">
            <QuestionList
              campaignId={campaignId}
              canEdit={canEdit}
              questions={drafts}
              showReply
              pendingTarget={pendingTarget}
              jobsActive={false}
              onSubmitStart={(replyKey) => {
                setPendingTarget(replyKey);
              }}
            />
          </div>
        </HarperDraftProvider>
      ) : null}
    </div>
  );
}

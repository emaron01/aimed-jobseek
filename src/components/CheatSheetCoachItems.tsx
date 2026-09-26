"use client";

import { answerCheatSheetCoachAction } from "@/app/actions/application-summary";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import type { CheatSheetCoachItem } from "@/lib/application-summary/contract";
import {
  applicationSummaryConfig,
  consultationConversationCopy,
} from "@/lib/product-config";

export function CheatSheetCoachItems({
  campaignId,
  canEdit,
  items,
}: {
  campaignId: string;
  canEdit: boolean;
  items: CheatSheetCoachItem[];
}) {
  if (items.length === 0) {
    return <p className="text-sm text-subtle">Not stated.</p>;
  }
  return (
    <ul className="space-y-4" data-testid="cheat-sheet-coach-items">
      {items.map((item) => {
        const answer = item.sampleAnswer?.trim() ?? "";
        const harperQuestion = item.harperQuestion?.trim() ?? "";
        return (
          <li
            key={item.id ?? item.prompt}
            className="rounded-md border border-edge bg-canvas p-4"
            data-testid={`cheat-sheet-coach-${item.id ?? "item"}`}
          >
            <p className="text-sm font-medium text-ink">{item.prompt}</p>
            {answer ? (
              <div className="mt-2">
                <p className="text-xs font-medium uppercase tracking-wide text-subtle">
                  {applicationSummaryConfig.sections.sampleAnswer}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{answer}</p>
              </div>
            ) : null}
            {harperQuestion ? (
              <div className="mt-3 space-y-2" data-testid="cheat-sheet-harper-question">
                <p className="text-sm text-ink">{harperQuestion}</p>
                {canEdit ? (
                  <ApplicationActionForm
                    action={answerCheatSheetCoachAction}
                    submitLabel={consultationConversationCopy.threadReply}
                    pendingLabel={consultationConversationCopy.thinking}
                    testId={`cheat-sheet-coach-reply-${item.id}`}
                  >
                    <input type="hidden" name="campaignId" value={campaignId} />
                    <input type="hidden" name="itemId" value={item.id ?? ""} />
                    <label className="block text-sm">
                      <span className="font-medium text-ink">
                        {consultationConversationCopy.threadReply}
                      </span>
                      <textarea
                        name="answer"
                        required
                        rows={3}
                        className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
                      />
                    </label>
                  </ApplicationActionForm>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

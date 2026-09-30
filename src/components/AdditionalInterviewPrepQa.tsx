import {
  workspaceHarperCoachItemHref,
  workspaceHarperQuestionHref,
  workspaceHarperStandingQuestionHref,
} from "@/lib/application/workspace-links";
import {
  ADDITIONAL_INTERVIEW_PREP_QA_HEADING,
  type AdditionalPrepQaEntry,
} from "@/lib/consultation/additional-prep-qa";
import { coachItemIdFromCheatSheetTarget } from "@/lib/consultation/harper-layout";
import { consultationConversationCopy } from "@/lib/product-config";

function editHrefForEntry(
  campaignId: string,
  entry: AdditionalPrepQaEntry,
): string {
  const coachId = coachItemIdFromCheatSheetTarget(entry.targetKey);
  if (entry.primaryContactId) {
    if (coachId && !entry.questionTurnId) {
      return workspaceHarperCoachItemHref(
        campaignId,
        entry.primaryContactId,
        coachId,
      );
    }
    return workspaceHarperQuestionHref(
      campaignId,
      entry.primaryContactId,
      entry.questionTurnId,
    );
  }
  return workspaceHarperStandingQuestionHref(campaignId, entry.questionTurnId);
}

/**
 * Display-only mirror of answered Harper Q&A for Direct roles (Batch B5).
 * No forms — Edit links to the single primary question on Harper.
 */
export function AdditionalInterviewPrepQa({
  campaignId,
  entries,
  showHeading = true,
}: {
  campaignId: string;
  entries: AdditionalPrepQaEntry[];
  /** Cheat Sheet supplies the collapsible heading. Harper keeps this heading. */
  showHeading?: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <div
      className="space-y-3"
      data-testid="additional-interview-prep-qa"
    >
      {showHeading ? (
        <h3 className="font-medium text-ink">
          {ADDITIONAL_INTERVIEW_PREP_QA_HEADING}
        </h3>
      ) : null}
      <ul className="space-y-4">
        {entries.map((entry) => (
          <li
            key={entry.questionTurnId}
            className="rounded-md border border-edge bg-canvas p-4"
            data-testid={`additional-prep-qa-${entry.questionTurnId}`}
            data-additional-prep-question={entry.questionTurnId}
          >
            <p className="text-sm font-medium text-ink">{entry.question}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
              {entry.answer}
            </p>
            <p className="mt-3 print:hidden">
              <a
                href={editHrefForEntry(campaignId, entry)}
                className="text-sm font-medium text-ink underline decoration-ink underline-offset-2"
                data-testid={`additional-prep-qa-edit-${entry.questionTurnId}`}
              >
                {consultationConversationCopy.editAnswer}
              </a>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

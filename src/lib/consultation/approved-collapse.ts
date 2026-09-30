import { questionHasApprovedResult } from "@/lib/consultation/harper-three-sections";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import { consultationConversationCopy } from "@/lib/product-config/consultation";

/** Larger than the previous text-xs ink chip, using the existing success tokens. */
export const APPROVED_STATUS_BADGE_CLASS =
  "inline-flex items-center rounded-md border border-success bg-success-tint px-2 py-1 text-base font-semibold normal-case tracking-normal text-success";

export function approvedAnswersAreAllExpanded(
  approvedIds: readonly string[],
  expandedIds: ReadonlySet<string>,
): boolean {
  return (
    approvedIds.length > 0 && approvedIds.every((id) => expandedIds.has(id))
  );
}

export function approvedCollapseControlLabel(allExpanded: boolean): string {
  return allExpanded
    ? consultationConversationCopy.collapseAllApproved
    : consultationConversationCopy.expandAllApproved;
}

export function nextApprovedExpandedIds(
  approvedIds: readonly string[],
  expandedIds: ReadonlySet<string>,
  action:
    | { type: "toggle-all" }
    | { type: "set"; id: string; expanded: boolean },
): Set<string> {
  if (action.type === "toggle-all") {
    return approvedAnswersAreAllExpanded(approvedIds, expandedIds)
      ? new Set()
      : new Set(approvedIds);
  }
  if (!approvedIds.includes(action.id)) {
    return new Set(expandedIds);
  }
  const next = new Set(expandedIds);
  if (action.expanded) next.add(action.id);
  else next.delete(action.id);
  return next;
}

/**
 * Collapsed approved rows label the question, never the answer preview.
 * Open questions and drafts are not passed here.
 */
export function collapsedApprovedQuestionLabel(question: string): string {
  const text = question.trim();
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

export function collectApprovedQuestionIds(input: {
  standingEntries: Array<{ questions: ConsultationQaItem[] }>;
  bestPracticeQuestions: ConsultationQaItem[];
}): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  function take(item: ConsultationQaItem) {
    if (item.ignored || !questionHasApprovedResult(item)) return;
    if (seen.has(item.questionTurnId)) return;
    seen.add(item.questionTurnId);
    ids.push(item.questionTurnId);
  }
  for (const entry of input.standingEntries) {
    for (const question of entry.questions) take(question);
  }
  for (const question of input.bestPracticeQuestions) take(question);
  return ids;
}

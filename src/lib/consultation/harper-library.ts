import { createHash } from "node:crypto";

import { sameRequirementMeaning } from "@/lib/consultation/assess";
import {
  WHY_THIS_COMPANY_TARGET_KEY,
  type InterviewTypeTag,
} from "@/lib/consultation/contract";
import { interviewerQuestionMatchesGeneral } from "@/lib/consultation/general-question-match";
import { interviewTypeTagFromQuestionContext } from "@/lib/consultation/qa-view";
import { prisma } from "@/lib/prisma-client";

/** Approved wording added to the role-expertise answers prompt and Harper's polish prompt. */
export const HARPER_LIBRARY_TAILOR_INSTRUCTION =
  "Combine as many approved answers and profile facts as the question needs. Keep every employer, number, title, and outcome exactly as stated; a result achieved at one company stays at that company. Use this company and role only to frame why the experience matters here.";

export type HarperLibraryMatch = {
  statementId: string;
  content: string;
  question: string;
  interviewTypeTag: InterviewTypeTag | null;
  approvedAt: Date;
};

export type HarperLibraryFingerprintMatch = {
  statementId: string | null;
  contentHash: string | null;
};

export function harperLibraryContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function emptyHarperLibraryFingerprintMatch(): HarperLibraryFingerprintMatch {
  return { statementId: null, contentHash: null };
}

export function harperLibraryFingerprintMatch(
  match: HarperLibraryMatch | null,
): HarperLibraryFingerprintMatch {
  if (!match) return emptyHarperLibraryFingerprintMatch();
  return {
    statementId: match.statementId,
    contentHash: harperLibraryContentHash(match.content),
  };
}

/** One approved answer from another application, cited as approved:<statementId>. */
export type ApprovedAnswerEvidence = {
  id: string;
  statementId: string;
  question: string;
  content: string;
  approvedAt: string;
  sourceApplicationId: string;
};

/** A stored approved answer before target matching. STAR fields are never loaded. */
export type ApprovedAnswerCandidate = {
  statementId: string;
  question: string;
  content: string;
  approvedAt: Date;
  sourceCampaignId: string;
  targetKey: string | null;
  whyThisCompany: string | null;
};

export function approvedAnswerEvidenceId(statementId: string): string {
  return `approved:${statementId}`;
}

function approvedAnswerIsEligible(
  answer: ApprovedAnswerCandidate,
  campaignId: string,
): boolean {
  if (answer.sourceCampaignId === campaignId) return false;
  if (!answer.content.trim() || !answer.question.trim()) return false;
  if (answer.targetKey === WHY_THIS_COMPANY_TARGET_KEY) return false;
  const whyThisCompany = answer.whyThisCompany?.trim() ?? "";
  if (!whyThisCompany) return true;
  return (
    answer.content.trim() !== whyThisCompany &&
    answer.question.trim() !== whyThisCompany
  );
}

function newerApprovedAnswer(
  left: ApprovedAnswerCandidate,
  right: ApprovedAnswerCandidate,
): number {
  const byTime = right.approvedAt.getTime() - left.approvedAt.getTime();
  if (byTime !== 0) return byTime;
  return right.statementId.localeCompare(left.statementId);
}

/**
 * At most one approved answer per current target. Newest approvedAt wins when
 * two answers match the same target. This application's own statements, empty
 * content, why-this-company answers, and another campaign's whyThisCompany
 * text are left out. No provider call.
 */
export function selectApprovedAnswersForTargets(input: {
  campaignId: string;
  targets: ReadonlyArray<{ key: string; text: string }>;
  answers: ReadonlyArray<ApprovedAnswerCandidate>;
}): ApprovedAnswerEvidence[] {
  const eligible = input.answers.filter((answer) =>
    approvedAnswerIsEligible(answer, input.campaignId),
  );
  const used = new Set<string>();
  const selected: ApprovedAnswerEvidence[] = [];
  for (const target of input.targets) {
    if (target.key === WHY_THIS_COMPANY_TARGET_KEY) continue;
    const text = target.text.trim();
    if (!text) continue;
    const winner = eligible
      .filter(
        (answer) =>
          !used.has(answer.statementId) &&
          (sameRequirementMeaning(answer.question, text) ||
            sameRequirementMeaning(answer.content, text)),
      )
      .sort(newerApprovedAnswer)[0];
    if (!winner) continue;
    used.add(winner.statementId);
    selected.push({
      id: approvedAnswerEvidenceId(winner.statementId),
      statementId: winner.statementId,
      question: winner.question.trim(),
      content: winner.content.trim(),
      approvedAt: winner.approvedAt.toISOString(),
      sourceApplicationId: winner.sourceCampaignId,
    });
  }
  return selected;
}

/** Load other applications' approved answers and keep one match per target. */
export async function loadApprovedAnswersForTargets(input: {
  organizationId: string;
  campaignId: string;
  targets: ReadonlyArray<{ key: string; text: string }>;
}): Promise<ApprovedAnswerEvidence[]> {
  const rows = await prisma.consultationStatement.findMany({
    where: {
      organizationId: input.organizationId,
      kind: "INTERVIEW_ANSWER",
      status: "APPROVED",
      approvedAt: { not: null },
      session: { campaignId: { not: input.campaignId } },
    },
    select: {
      id: true,
      content: true,
      approvedAt: true,
      session: {
        select: {
          campaignId: true,
          campaign: { select: { whyThisCompany: true } },
        },
      },
      turn: { select: { body: true, targetKey: true } },
    },
  });
  const answers: ApprovedAnswerCandidate[] = [];
  for (const row of rows) {
    if (!(row.approvedAt instanceof Date)) continue;
    answers.push({
      statementId: row.id,
      question: row.turn.body,
      content: row.content,
      approvedAt: row.approvedAt,
      sourceCampaignId: row.session.campaignId,
      targetKey: row.turn.targetKey,
      whyThisCompany: row.session.campaign.whyThisCompany,
    });
  }
  return selectApprovedAnswersForTargets({
    campaignId: input.campaignId,
    targets: input.targets,
    answers,
  });
}

/**
 * Best approved interview answer from another application in this organization.
 * No provider call. Current content wins over the text that was first approved.
 */
export async function findHarperLibraryMatch(input: {
  organizationId: string;
  campaignId: string;
  question: string;
  interviewTypeTag?: InterviewTypeTag | null;
}): Promise<HarperLibraryMatch | null> {
  const question = input.question.trim();
  if (!question) return null;

  const rows = await prisma.consultationStatement.findMany({
    where: {
      organizationId: input.organizationId,
      kind: "INTERVIEW_ANSWER",
      status: "APPROVED",
      approvedAt: { not: null },
      session: { campaignId: { not: input.campaignId } },
    },
    select: {
      id: true,
      content: true,
      approvedAt: true,
      turn: { select: { body: true, questionContextJson: true } },
    },
  });

  const ranked = rows
    .filter(
      (row): row is typeof row & { approvedAt: Date } =>
        row.approvedAt instanceof Date &&
        row.content.trim().length > 0 &&
        row.turn.body.trim().length > 0,
    )
    .sort((left, right) => right.approvedAt.getTime() - left.approvedAt.getTime());

  for (const row of ranked) {
    const tag = interviewTypeTagFromQuestionContext(row.turn.questionContextJson);
    const matched = interviewerQuestionMatchesGeneral({
      interviewerText: question,
      interviewerTag: input.interviewTypeTag,
      generalText: row.turn.body,
      generalTag: tag,
    });
    if (!matched) continue;
    return {
      statementId: row.id,
      content: row.content,
      question: row.turn.body.trim(),
      interviewTypeTag: tag,
      approvedAt: row.approvedAt,
    };
  }
  return null;
}

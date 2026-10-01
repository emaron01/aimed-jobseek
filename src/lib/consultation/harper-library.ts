import { createHash } from "node:crypto";

import type { InterviewTypeTag } from "@/lib/consultation/contract";
import { interviewerQuestionMatchesGeneral } from "@/lib/consultation/general-question-match";
import { interviewTypeTagFromQuestionContext } from "@/lib/consultation/qa-view";
import { prisma } from "@/lib/prisma-client";

/** Approved wording added to the role-expertise answers prompt and Harper's polish prompt. */
export const HARPER_LIBRARY_TAILOR_INSTRUCTION =
  "When a prior approved answer is supplied, tailor it to this company and role. Replace anything about the previous company with this company's information; never carry it over. Do not add employers, numbers, titles, or outcomes that are not in the supplied answer or the Personal Profile.";

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

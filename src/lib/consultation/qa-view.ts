import {
  INTERVIEW_TYPE_TAGS,
  ROLE_EXPERTISE_TARGET_PREFIX,
  type InterviewTypeTag,
} from "@/lib/consultation/contract";
import { consultationConversationCopy } from "@/lib/product-config/consultation";

export type QaTurn = {
  id: string;
  speaker: "CONSULTANT" | "SEEKER";
  body: string;
  targetKey: string | null;
  followUp: boolean;
  sequence: number;
  analysisJson?: unknown;
  intent?: string | null;
  questionContextJson?: unknown;
};

export type QaStatement = {
  id: string;
  turnId: string;
  kind: "INTERVIEW_ANSWER" | "RESUME_BULLET";
  status: string;
  content: string;
  strengtheningNote: string | null;
  createdAt?: Date | string | null;
};

export type ConsultationQaItem = {
  questionTurnId: string;
  targetKey: string | null;
  question: string;
  followUp: { turnId: string; text: string } | null;
  seekerAnswers: Array<{ id: string; body: string; analysisJson?: unknown }>;
  statements: QaStatement[];
  resumeBullet: QaStatement | null;
  talkingPoint: QaStatement | null;
  /**
   * WHO interview type from questionContextJson. Null for older turns.
   * Never shown to the seeker.
   */
  interviewTypeTag?: InterviewTypeTag | null;
  /** Seeker dismissed this question; show Ignored link until reopened. */
  ignored?: boolean;
  /**
   * Seeker answered but Harper could not shape a result after bounded regen.
   * Show needs-more-detail copy; session stays READY; no Harper result stored.
   */
  needsMoreDetail?: boolean;
};

export function interviewTypeTagFromQuestionContext(
  value: unknown,
): InterviewTypeTag | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const tag = (value as { interviewTypeTag?: unknown }).interviewTypeTag;
  return INTERVIEW_TYPE_TAGS.includes(tag as InterviewTypeTag)
    ? (tag as InterviewTypeTag)
    : null;
}

export type ConsultationQaView = {
  questions: ConsultationQaItem[];
};

export function isClosingNoteTurn(turn: Pick<QaTurn, "speaker" | "intent">): boolean {
  return turn.speaker === "CONSULTANT" && turn.intent === "CLOSING";
}

export function isCoachingNoteTurn(turn: Pick<QaTurn, "speaker" | "intent">): boolean {
  return turn.speaker === "CONSULTANT" && turn.intent === "COACHING";
}

export function isLegacyInaccuracyReply(
  turn: Pick<QaTurn, "speaker" | "body" | "intent">,
): boolean {
  if (turn.speaker !== "SEEKER") return false;
  if (turn.intent === "NOT_ACCURATE") return true;
  return turn.body.trim() === "Not accurate.";
}

export function latestClosingNote(turns: QaTurn[]): string | null {
  const closing = [...turns]
    .filter(isClosingNoteTurn)
    .sort((left, right) => left.sequence - right.sequence)
    .at(-1);
  return closing?.body.trim() || null;
}

export function latestCoachingNoteForTarget(
  turns: QaTurn[],
  targetKey: string | null,
): string | null {
  if (!targetKey) return null;
  const note = [...turns]
    .filter(
      (turn) =>
        isCoachingNoteTurn(turn) &&
        turn.targetKey === targetKey &&
        Boolean(turn.body.trim()),
    )
    .sort((left, right) => left.sequence - right.sequence)
    .at(-1);
  return note?.body.trim() || null;
}

export function isPrimaryHarperQuestion(turn: QaTurn): boolean {
  return (
    turn.speaker === "CONSULTANT" &&
    !turn.followUp &&
    !isClosingNoteTurn(turn) &&
    !isCoachingNoteTurn(turn)
  );
}

function statementTime(statement: QaStatement): number {
  if (!statement.createdAt) return 0;
  const value = new Date(statement.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function latestOfKind(
  statements: QaStatement[],
  kind: QaStatement["kind"],
  preferredTurnId?: string | null,
): QaStatement | null {
  const matches = statements.filter((statement) => statement.kind === kind);
  if (matches.length === 0) return null;
  const preferred = preferredTurnId
    ? matches.filter((statement) => statement.turnId === preferredTurnId)
    : [];
  const pool = preferred.length > 0 ? preferred : matches;
  return [...pool].sort((left, right) => statementTime(left) - statementTime(right)).at(-1) ?? null;
}

function emptyItem(turn: QaTurn): ConsultationQaItem {
  return {
    questionTurnId: turn.id,
    targetKey: turn.targetKey,
    question: turn.body,
    followUp: null,
    seekerAnswers: [],
    statements: [],
    resumeBullet: null,
    talkingPoint: null,
    interviewTypeTag: interviewTypeTagFromQuestionContext(
      turn.questionContextJson,
    ),
    ignored: false,
  };
}

export function replyToTurnIdFromAnalysis(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as { replyToTurnId?: unknown }).replyToTurnId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/** Seeker turn analysis: Harper could not shape a result; seeker should add detail. */
export function needsMoreDetailFromAnalysis(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (value as { needsMoreDetail?: unknown }).needsMoreDetail === true;
}

/** Seeker dismissed a Harper question or gap (Ignore). */
export function isIgnoredSeekerTurn(
  turn: Pick<QaTurn, "speaker" | "analysisJson">,
): boolean {
  if (turn.speaker !== "SEEKER") return false;
  if (!turn.analysisJson || typeof turn.analysisJson !== "object") return false;
  return (turn.analysisJson as { ignored?: unknown }).ignored === true;
}

/** Active ignore turns for a gap/question target (reopen clears these). */
export function ignoredSeekerTurnsForTarget(
  turns: Array<Pick<QaTurn, "id" | "speaker" | "targetKey" | "analysisJson">>,
  targetKey: string | null | undefined,
): Array<Pick<QaTurn, "id" | "speaker" | "targetKey" | "analysisJson">> {
  const key = targetKey?.trim() ?? "";
  if (!key) return [];
  return turns.filter(
    (turn) =>
      isIgnoredSeekerTurn(turn) &&
      (turn.targetKey === key ||
        replyToTurnIdFromAnalysis(turn.analysisJson) === key),
  );
}

export function isTargetCurrentlyIgnored(
  turns: Array<Pick<QaTurn, "id" | "speaker" | "targetKey" | "analysisJson">>,
  targetKey: string | null | undefined,
): boolean {
  const key = targetKey?.trim() ?? "";
  if (!key) return false;
  return turns.some(
    (turn) => isIgnoredSeekerTurn(turn) && turn.targetKey === key,
  );
}

export function consultationReplyTargetKey(questionTurnId: string): string {
  return `question:${questionTurnId}`;
}

export function parseConsultationReplyTarget(requested: string): {
  questionTurnId: string | null;
  raw: string;
} {
  const raw = requested.trim();
  if (raw.startsWith("question:")) {
    const questionTurnId = raw.slice("question:".length).trim();
    return { questionTurnId: questionTurnId || null, raw };
  }
  return { questionTurnId: null, raw };
}

export function consultationQuestionAcceptsReply(
  item: ConsultationQaItem,
): boolean {
  if (item.ignored) return false;
  if (item.followUp != null) return true;
  // Role-expertise suggested drafts attach to the question turn with no seeker
  // reply yet — still open so the seeker can reply and refine (Batch D6).
  if (
    item.seekerAnswers.length === 0 &&
    !item.resumeBullet &&
    item.talkingPoint?.status === "DRAFT" &&
    Boolean(item.targetKey?.startsWith(ROLE_EXPERTISE_TARGET_PREFIX))
  ) {
    return true;
  }
  return !item.resumeBullet && !item.talkingPoint;
}

export function findConsultationQaItem(
  view: ConsultationQaView,
  requested: string,
): ConsultationQaItem | null {
  const { questionTurnId, raw } = parseConsultationReplyTarget(requested);
  if (questionTurnId) {
    return (
      view.questions.find(
        (question) => question.questionTurnId === questionTurnId,
      ) ?? null
    );
  }
  if (!raw) return null;
  return (
    view.questions.find(
      (item) => item.targetKey === raw || item.questionTurnId === raw,
    ) ?? null
  );
}

export function resolveReplyableQaItem(
  view: ConsultationQaView,
  requested: string,
): ConsultationQaItem | null {
  const { questionTurnId, raw } = parseConsultationReplyTarget(requested);
  if (questionTurnId) {
    const item = view.questions.find(
      (question) => question.questionTurnId === questionTurnId,
    );
    return item && consultationQuestionAcceptsReply(item) ? item : null;
  }
  if (!raw) return null;
  const replyable = view.questions.filter(
    (item) =>
      consultationQuestionAcceptsReply(item) &&
      (item.targetKey === raw || item.questionTurnId === raw),
  );
  return replyable[0] ?? null;
}

export function consultationFollowUpCount(
  turns: QaTurn[],
  questionTurnId: string,
): number {
  return turns.filter((turn) => {
    if (turn.speaker !== "CONSULTANT") return false;
    if (!turn.followUp) return false;
    return primaryFor(turns, turn).id === questionTurnId;
  }).length;
}

function questionAnsweredBy(turns: QaTurn[], seeker: QaTurn): QaTurn | null {
  const pinnedId = replyToTurnIdFromAnalysis(seeker.analysisJson);
  if (pinnedId) {
    const pinned = turns.find(
      (turn) => turn.id === pinnedId && turn.speaker === "CONSULTANT",
    );
    if (pinned) return pinned;
  }
  return (
    [...turns]
      .reverse()
      .find(
        (turn) =>
          turn.speaker === "CONSULTANT" &&
          turn.sequence < seeker.sequence &&
          (seeker.targetKey == null ||
            turn.targetKey == null ||
            turn.targetKey === seeker.targetKey),
      ) ?? null
  );
}

/**
 * Walk the reply chain from a consultant turn (primary or follow-up) to the
 * primary Harper question card that owns it.
 */
export function primaryFor(turns: QaTurn[], consultant: QaTurn): QaTurn {
  const pinnedId = replyToTurnIdFromAnalysis(consultant.analysisJson);
  if (pinnedId && pinnedId !== consultant.id) {
    const pinned = turns.find((turn) => turn.id === pinnedId);
    if (pinned) {
      return isPrimaryHarperQuestion(pinned)
        ? pinned
        : primaryFor(turns, pinned);
    }
  }
  if (isPrimaryHarperQuestion(consultant)) return consultant;
  const sameKey = [...turns]
    .reverse()
    .find(
      (turn) =>
        isPrimaryHarperQuestion(turn) &&
        turn.sequence < consultant.sequence &&
        (consultant.targetKey == null ||
          turn.targetKey == null ||
          turn.targetKey === consultant.targetKey),
    );
  if (sameKey) return sameKey;
  return (
    [...turns]
      .reverse()
      .find(
        (turn) =>
          isPrimaryHarperQuestion(turn) && turn.sequence < consultant.sequence,
      ) ?? consultant
  );
}

/**
 * Primary question turn id for a seeker reply. Prefer the recorded replyToTurnId
 * (follow-up or primary), walked through primaryFor — never the first replyable
 * card that merely shares a targetKey.
 */
export function primaryQuestionTurnIdForSeekerReply(input: {
  turns: QaTurn[];
  seeker: Pick<QaTurn, "analysisJson" | "sequence" | "targetKey">;
  hintQuestionTurnId?: string | null;
}): string | null {
  const pinnedId =
    replyToTurnIdFromAnalysis(input.seeker.analysisJson) ??
    (input.hintQuestionTurnId?.trim() || null);
  if (pinnedId) {
    const asked = input.turns.find(
      (turn) => turn.id === pinnedId && turn.speaker === "CONSULTANT",
    );
    if (asked) return primaryFor(input.turns, asked).id;
    const asPrimary = input.turns.find(
      (turn) => turn.id === pinnedId && isPrimaryHarperQuestion(turn),
    );
    if (asPrimary) return asPrimary.id;
  }
  const answered = questionAnsweredBy(input.turns, {
    id: "",
    speaker: "SEEKER",
    body: "",
    targetKey: input.seeker.targetKey,
    followUp: false,
    sequence: input.seeker.sequence,
    analysisJson: input.seeker.analysisJson,
  });
  if (!answered) return null;
  return primaryFor(input.turns, answered).id;
}

function seekerAnsweredThis(turns: QaTurn[], consultant: QaTurn): boolean {
  const primaryId = primaryFor(turns, consultant).id;
  return turns.some((turn) => {
    if (turn.speaker !== "SEEKER" || turn.sequence <= consultant.sequence) {
      return false;
    }
    const answered = questionAnsweredBy(turns, turn);
    if (answered?.id === consultant.id) return true;
    return (
      replyToTurnIdFromAnalysis(turn.analysisJson) === primaryId &&
      consultant.followUp
    );
  });
}

export function consultationHasUnansweredQuestions(
  view: ConsultationQaView,
): boolean {
  return view.questions.some(
    (item) => !item.ignored && consultationQuestionAcceptsReply(item),
  );
}

export function buildConsultationQaView(input: {
  turns: QaTurn[];
  statements: QaStatement[];
}): ConsultationQaView {
  const turns = [...input.turns].sort((left, right) => left.sequence - right.sequence);
  const byTurn = new Map<string, QaStatement[]>();
  for (const statement of input.statements) {
    const existing = byTurn.get(statement.turnId) ?? [];
    existing.push(statement);
    byTurn.set(statement.turnId, existing);
  }

  const items = new Map<string, ConsultationQaItem>();
  const order: string[] = [];
  const ensure = (turn: QaTurn): ConsultationQaItem => {
    const existing = items.get(turn.id);
    if (existing) return existing;
    const created = emptyItem(turn);
    items.set(turn.id, created);
    order.push(turn.id);
    return created;
  };

  for (const turn of turns) {
    if (!isPrimaryHarperQuestion(turn)) continue;
    const item = ensure(turn);
    // Role-expertise suggested answers (Batch D6) are DRAFT INTERVIEW_ANSWER
    // statements on the CONSULTANT question turn — not on a seeker reply.
    item.statements.push(...(byTurn.get(turn.id) ?? []));
  }

  for (const seeker of turns) {
    if (seeker.speaker !== "SEEKER") continue;
    if (isLegacyInaccuracyReply(seeker)) continue;
    if (isIgnoredSeekerTurn(seeker)) continue;
    const answered = questionAnsweredBy(turns, seeker);
    if (!answered) {
      const item = ensure({
        id: seeker.id,
        speaker: "CONSULTANT",
        body: consultationConversationCopy.yourAnswer,
        targetKey: seeker.targetKey,
        followUp: false,
        sequence: seeker.sequence,
      });
      item.seekerAnswers.push({
        id: seeker.id,
        body: seeker.body,
        analysisJson: seeker.analysisJson,
      });
      item.statements.push(...(byTurn.get(seeker.id) ?? []));
      continue;
    }
    const primary = primaryFor(turns, answered);
    const host = isPrimaryHarperQuestion(primary) ? primary : answered;
    const item = ensure(host);
    item.seekerAnswers.push({
      id: seeker.id,
      body: seeker.body,
      analysisJson: seeker.analysisJson,
    });
    item.statements.push(...(byTurn.get(seeker.id) ?? []));
  }

  for (const turn of turns) {
    if (turn.speaker !== "CONSULTANT") continue;
    const followUp = turn.followUp;
    if (!followUp || seekerAnsweredThis(turns, turn)) continue;
    const primary = primaryFor(turns, turn);
    if (isPrimaryHarperQuestion(primary) && primary.id !== turn.id) {
      ensure(primary).followUp = { turnId: turn.id, text: turn.body };
      continue;
    }
    ensure(turn);
  }

  const ignoredPrimaryIds = new Set(
    turns
      .filter(isIgnoredSeekerTurn)
      .map((turn) => {
        const pinned = replyToTurnIdFromAnalysis(turn.analysisJson);
        if (pinned) return pinned;
        const matched = questionAnsweredBy(turns, turn);
        return matched ? primaryFor(turns, matched).id : null;
      })
      .filter((id): id is string => Boolean(id)),
  );

  const sequenceById = new Map(turns.map((turn) => [turn.id, turn.sequence]));
  const questions = order
    .map((id) => {
      const item = items.get(id);
      if (!item) {
        throw new Error("Harper question grouping lost a drafted question.");
      }
      return {
        ...item,
        ignored: ignoredPrimaryIds.has(item.questionTurnId),
        resumeBullet: latestOfKind(
          item.statements,
          "RESUME_BULLET",
          item.seekerAnswers.at(-1)?.id,
        ),
        talkingPoint: latestOfKind(
          item.statements,
          "INTERVIEW_ANSWER",
          item.seekerAnswers.at(-1)?.id,
        ),
        needsMoreDetail: needsMoreDetailFromAnalysis(
          item.seekerAnswers.at(-1)?.analysisJson,
        ),
      };
    })
    .sort(
      (left, right) =>
        (sequenceById.get(left.questionTurnId) ?? 0) -
        (sequenceById.get(right.questionTurnId) ?? 0),
    );

  return { questions };
}

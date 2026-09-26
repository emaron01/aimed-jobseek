import { consultationConversationCopy } from "@/lib/product-config/consultation";

export type QaTurn = {
  id: string;
  speaker: "CONSULTANT" | "SEEKER";
  body: string;
  targetKey: string | null;
  followUp: boolean;
  sequence: number;
  analysisJson?: unknown;
};

export type QaStatement = {
  id: string;
  turnId: string;
  kind: "INTERVIEW_ANSWER" | "RESUME_BULLET";
  status: string;
  content: string;
  strengtheningNote: string | null;
};

export type ConsultationQaItem = {
  questionTurnId: string;
  targetKey: string | null;
  question: string;
  followUp: { turnId: string; text: string } | null;
  seekerAnswers: Array<{ id: string; body: string }>;
  statements: QaStatement[];
  resumeBullet: QaStatement | null;
  talkingPoint: QaStatement | null;
};

export type ConsultationQaView = {
  questions: ConsultationQaItem[];
};

export function isGenericFollowUpText(body: string): boolean {
  return body.trim() === consultationConversationCopy.askForStory.trim();
}

export function isPrimaryHarperQuestion(turn: QaTurn): boolean {
  return (
    turn.speaker === "CONSULTANT" &&
    !turn.followUp &&
    !isGenericFollowUpText(turn.body)
  );
}

function latestOfKind(
  statements: QaStatement[],
  kind: QaStatement["kind"],
): QaStatement | null {
  const matches = statements.filter((statement) => statement.kind === kind);
  return matches.at(-1) ?? null;
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
  };
}

export function replyToTurnIdFromAnalysis(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as { replyToTurnId?: unknown }).replyToTurnId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
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
  return item.followUp != null || (!item.resumeBullet && !item.talkingPoint);
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
    if (!turn.followUp && !isGenericFollowUpText(turn.body)) return false;
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

function primaryFor(turns: QaTurn[], consultant: QaTurn): QaTurn {
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
      (consultant.followUp || isGenericFollowUpText(consultant.body))
    );
  });
}

export function consultationHasUnansweredQuestions(
  view: ConsultationQaView,
): boolean {
  return view.questions.some(consultationQuestionAcceptsReply);
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
    if (isPrimaryHarperQuestion(turn)) ensure(turn);
  }

  for (const seeker of turns) {
    if (seeker.speaker !== "SEEKER") continue;
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
      item.seekerAnswers.push({ id: seeker.id, body: seeker.body });
      item.statements.push(...(byTurn.get(seeker.id) ?? []));
      continue;
    }
    const primary = primaryFor(turns, answered);
    const host = isPrimaryHarperQuestion(primary) ? primary : answered;
    const item = ensure(host);
    item.seekerAnswers.push({ id: seeker.id, body: seeker.body });
    item.statements.push(...(byTurn.get(seeker.id) ?? []));
  }

  for (const turn of turns) {
    if (turn.speaker !== "CONSULTANT") continue;
    const followUp = turn.followUp || isGenericFollowUpText(turn.body);
    if (!followUp || seekerAnsweredThis(turns, turn)) continue;
    const primary = primaryFor(turns, turn);
    if (isPrimaryHarperQuestion(primary) && primary.id !== turn.id) {
      ensure(primary).followUp = { turnId: turn.id, text: turn.body };
      continue;
    }
    ensure(turn);
  }

  const sequenceById = new Map(turns.map((turn) => [turn.id, turn.sequence]));
  const questions = order
    .map((id) => {
      const item = items.get(id);
      if (!item) {
        throw new Error("Harper question grouping lost a drafted question.");
      }
      return {
        ...item,
        resumeBullet: latestOfKind(item.statements, "RESUME_BULLET"),
        talkingPoint: latestOfKind(item.statements, "INTERVIEW_ANSWER"),
      };
    })
    .sort(
      (left, right) =>
        (sequenceById.get(left.questionTurnId) ?? 0) -
        (sequenceById.get(right.questionTurnId) ?? 0),
    );

  return { questions };
}

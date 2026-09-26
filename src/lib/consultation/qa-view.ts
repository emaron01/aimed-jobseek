import { consultationConversationCopy } from "@/lib/product-config/consultation";

export type QaTurn = {
  id: string;
  speaker: "CONSULTANT" | "SEEKER";
  body: string;
  targetKey: string | null;
  followUp: boolean;
  sequence: number;
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

function questionAnsweredBy(turns: QaTurn[], seeker: QaTurn): QaTurn | null {
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
  return turns.some(
    (turn) =>
      turn.speaker === "SEEKER" &&
      turn.sequence > consultant.sequence &&
      questionAnsweredBy(turns, turn)?.id === consultant.id,
  );
}

export function consultationHasUnansweredQuestions(
  view: ConsultationQaView,
): boolean {
  return view.questions.some(
    (item) => item.followUp != null || (!item.resumeBullet && !item.talkingPoint),
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

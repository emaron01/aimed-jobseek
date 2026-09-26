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
  seekerAnswers: Array<{ id: string; body: string }>;
  statements: QaStatement[];
  resumeBullet: QaStatement | null;
  talkingPoint: QaStatement | null;
};

export type ConsultationQaView = {
  answered: ConsultationQaItem[];
  currentQuestion: { turnId: string; text: string } | null;
};

function laterSeekerAnswered(turns: QaTurn[], question: QaTurn): boolean {
  return turns.some(
    (turn) =>
      turn.speaker === "SEEKER" &&
      turn.sequence > question.sequence &&
      (question.targetKey == null || turn.targetKey === question.targetKey),
  );
}

function latestOfKind(
  statements: QaStatement[],
  kind: QaStatement["kind"],
): QaStatement | null {
  const matches = statements.filter((statement) => statement.kind === kind);
  return matches.at(-1) ?? null;
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

  const topics: ConsultationQaItem[] = [];
  for (const turn of turns) {
    if (turn.speaker !== "CONSULTANT" || turn.followUp) continue;
    const seekerAnswers = turns
      .filter(
        (entry) =>
          entry.speaker === "SEEKER" &&
          entry.sequence > turn.sequence &&
          (turn.targetKey == null || entry.targetKey === turn.targetKey),
      )
      .filter((entry) => {
        const nextPrimary = turns.find(
          (candidate) =>
            candidate.speaker === "CONSULTANT" &&
            !candidate.followUp &&
            candidate.sequence > turn.sequence,
        );
        return !nextPrimary || entry.sequence < nextPrimary.sequence;
      })
      .map((entry) => ({ id: entry.id, body: entry.body }));
    const statements = seekerAnswers.flatMap(
      (answer) => byTurn.get(answer.id) ?? [],
    );
    topics.push({
      questionTurnId: turn.id,
      targetKey: turn.targetKey,
      question: turn.body,
      seekerAnswers,
      statements,
      resumeBullet: latestOfKind(statements, "RESUME_BULLET"),
      talkingPoint: latestOfKind(statements, "INTERVIEW_ANSWER"),
    });
  }

  const openFollowUp = [...turns]
    .reverse()
    .find(
      (turn) =>
        turn.speaker === "CONSULTANT" &&
        turn.followUp &&
        !laterSeekerAnswered(turns, turn),
    );
  const openPrimary = [...turns]
    .reverse()
    .find(
      (turn) =>
        turn.speaker === "CONSULTANT" &&
        !turn.followUp &&
        !laterSeekerAnswered(turns, turn),
    );
  const current = openFollowUp ?? openPrimary ?? null;

  const answered = topics.filter((topic) => {
    if (topic.seekerAnswers.length === 0) return false;
    if (!topic.resumeBullet && !topic.talkingPoint) return false;
    if (current && current.followUp && current.targetKey === topic.targetKey) {
      return false;
    }
    return true;
  });

  return {
    answered,
    currentQuestion: current
      ? { turnId: current.id, text: current.body }
      : null,
  };
}

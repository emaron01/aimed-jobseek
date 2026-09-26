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

  const questions: ConsultationQaItem[] = [];
  for (const turn of turns) {
    if (turn.speaker !== "CONSULTANT" || turn.followUp) continue;
    if (!turn.targetKey && turn.sequence > 0 && questions.length > 0) continue;
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
            candidate.sequence > turn.sequence &&
            (turn.targetKey == null ||
              candidate.targetKey !== turn.targetKey),
        );
        if (turn.targetKey) {
          return entry.targetKey === turn.targetKey;
        }
        return !nextPrimary || entry.sequence < nextPrimary.sequence;
      })
      .map((entry) => ({ id: entry.id, body: entry.body }));
    const statements = seekerAnswers.flatMap(
      (answer) => byTurn.get(answer.id) ?? [],
    );
    const openFollowUp = [...turns]
      .reverse()
      .find(
        (entry) =>
          entry.speaker === "CONSULTANT" &&
          entry.followUp &&
          (turn.targetKey == null || entry.targetKey === turn.targetKey) &&
          !laterSeekerAnswered(turns, entry),
      );
    questions.push({
      questionTurnId: turn.id,
      targetKey: turn.targetKey,
      question: turn.body,
      followUp: openFollowUp
        ? { turnId: openFollowUp.id, text: openFollowUp.body }
        : null,
      seekerAnswers,
      statements,
      resumeBullet: latestOfKind(statements, "RESUME_BULLET"),
      talkingPoint: latestOfKind(statements, "INTERVIEW_ANSWER"),
    });
  }

  return { questions };
}

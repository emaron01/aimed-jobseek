/**
 * Consultation product settings. The display name is the only place the
 * consultant is named.
 */
export const consultationConfig = Object.freeze({
  displayName: "Harper",
  roundSize: 3,
  maxFollowUpsPerTarget: 2,
  qualityRegenerationAttempts: 2,
  interviewAnswerWordRange: Object.freeze({ min: 80, max: 220 }),
  bannedPhrases: Object.freeze([
    "spearheaded",
    "leveraged",
    "synergies",
    "passionate about",
    "dynamic environment",
    "fast-paced",
    "results-driven",
    "proven track record",
    "thrilled",
    "delve",
    "—",
  ]),
});

export const evidenceStrengthLabels = Object.freeze({
  STRONG: "Strong",
  PARTIAL: "Partial",
  NONE: "None",
});

export const gapStrategyCopy = Object.freeze({
  PROVE_WITH_STORY: "Prove it with a story",
  REFRAME_ADJACENT: "Reframe adjacent experience",
  ACKNOWLEDGE: "Acknowledge it honestly",
});

export const consultationStatementLabels = Object.freeze({
  section: "Polished statements",
  INTERVIEW_ANSWER: "Interview answer",
  RESUME_BULLET: "Resume bullet",
  DRAFT: "Draft",
  APPROVED: "Approved",
});

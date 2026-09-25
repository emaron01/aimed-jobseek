/**
 * Consultation product settings. The display name is the only place the
 * consultant is named.
 */
export const consultationConfig = Object.freeze({
  displayName: "Harper",
  roundSize: 1,
  maxFollowUpsPerTarget: 2,
  qualityRegenerationAttempts: 2,
  interviewAnswerMaxWords: 220,
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
  interviewAnswerBannedPhrases: Object.freeze([
    "the task in this example was",
    "the starting point was",
    "the comparison point was",
    "providing the measurable result",
    "the situation in this example was",
    "the action in this example was",
    "the result in this example was",
    "the situation was",
    "the task was",
    "the action was",
    "the result was",
    "for the situation",
    "for the task",
    "for the action",
    "for the result",
    "my situation was",
    "my task was",
    "my action was",
    "my result was",
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
  strengtheningNote: `${consultationConfig.displayName}'s note`,
  INTERVIEW_ANSWER: "Interview answer",
  RESUME_BULLET: "Resume bullet",
  DRAFT: "Draft",
  APPROVED: "Approved",
});

export const consultationConversationCopy = Object.freeze({
  whereYouStand: "Where you stand",
  threadReply: "Reply",
  useThis: "Use this",
  changeSomething: "Change something",
  notAccurate: "Not accurate",
  changePrompt: "What should change?",
  generationFailed: `${consultationConfig.displayName} could not write this coaching. Retry when the consultation model is available.`,
  retry: `Retry ${consultationConfig.displayName}`,
  start: `Start with ${consultationConfig.displayName}`,
  planComplete: "The plan for this conversation is complete.",
  nextStepTitle: "Next step",
  nextStepFailed: `${consultationConfig.displayName} could not write the next step. Retry when the consultation model is available.`,
  nextStepRetry: "Retry next step",
});

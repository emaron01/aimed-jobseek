/**
 * Consultation product settings. The display name is the only place the
 * consultant is named.
 */
import { applicationWorkspaceCopy, vocab } from "./vocabulary";
export const consultationConfig = Object.freeze({
  displayName: "Harper",
  roundSize: 10,
  maxFollowUpsPerTarget: 1,
  qualityRegenerationAttempts: 2,
  interviewAnswerMaxWords: 220,
  interviewAnswerMetaLanguage: Object.freeze([
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
  expandEvidence: "Expand evidence",
  collapseEvidence: "Collapse evidence",
  expandAllEvidence: "Expand all",
  collapseAllEvidence: "Collapse all",
  threadReply: "Reply",
  seekerSpeaker: "You",
  yourAnswer: "Your answer",
  showYourReplies: "Show your replies",
  hideYourReplies: "Hide your replies",
  approve: "Approve",
  useThis: "Use this",
  confirmed: "Saved. The next question is on the way.",
  changeSomething: "Change something",
  notAccurate: "Not accurate",
  changePrompt: "What should change?",
  generationFailed: `${consultationConfig.displayName} could not finish this coaching. Retry.`,
  generationQualityFailed: `${consultationConfig.displayName} could not keep one part of this coaching after checks. The rest is below. Retry the missing part.`,
  planUnusable: `${consultationConfig.displayName} could not plan this conversation. Retry.`,
  askForStory:
    "Tell me what happened, what you did, and what the result was.",
  keepCoaching:
    "I can work with what you shared. A bit more detail will make the story stronger.",
  missingStarAsk: {
    SITUATION: "Tell me what the situation was.",
    TASK: "Tell me what you were asked to do.",
    ACTION: "Tell me what you did.",
    RESULT: "Tell me what the result was.",
    METRIC: "Tell me the number or outcome.",
  },
  modelUnavailable: `${consultationConfig.displayName} could not start this coaching. Retry when you are ready.`,
  retry: `Retry ${consultationConfig.displayName}`,
  start: `Start with ${consultationConfig.displayName}`,
  planComplete: "The plan for this conversation is complete.",
  starting: `${consultationConfig.displayName} is reading your ${vocab.product.singular} and the job…`,
  typing: `${consultationConfig.displayName} is thinking…`,
  thinking: `${consultationConfig.displayName} is thinking…`,
  whyThisCompanyTarget: "Why you want to work at this company",
  whyThisCompanyQuestion:
    "Why do you want to work at this company? Say what specifically draws you to it for this role.",
  nextStepTitle: applicationWorkspaceCopy.nextStepTitle,
  nextStepFailed: `${consultationConfig.displayName} could not write the next step. Retry.`,
  nextStepModelUnavailable: `${consultationConfig.displayName} could not write the next step. Retry when you are ready.`,
  nextStepRetry: "Retry next step",
});

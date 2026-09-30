/**
 * Consultation product settings. The display name is the only place the
 * consultant is named.
 */
import { applicationWorkspaceCopy, vocab } from "./vocabulary";
export const consultationConfig = Object.freeze({
  displayName: "Harper",
  roundSize: 25,
  applicationQuestionLimit: 25,
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

export const consultationGapStatusCopy = Object.freeze({
  open: "Open",
  closed: "Closed",
  confirmed: "Confirmed gap",
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
  whereYouStandDescription:
    "How your experience matches this job, requirement by requirement.",
  needsMoreInfoTitle: "Questions that need more information",
  needsMoreInfoDescription:
    "Harper needs a little more from you on these. Your answers fill the gaps in Where you stand.",
  bestPracticeTitlePrefix: "Best-practice interview questions for a ",
  bestPracticeDescription:
    "Questions a hiring manager for this role commonly asks, with Harper's suggested answers drawn from your profile. Edit them to make them yours, then approve.",
  pageIntro:
    "Harper helps you prepare the answers you'll use throughout this application. What you approve here is what she uses to build your resume, cover letter, outreach, and interview cheat sheets. Answer what you can, skip what you can't, review her suggestions, and approve what best represents your background in a professional way. When it's time to interview, your cheat sheet brings it all together.",
  generalQuestions: "General questions",
  expandEvidence: "Expand evidence",
  collapseEvidence: "Collapse evidence",
  expandAllEvidence: "Expand all",
  collapseAllEvidence: "Collapse all",
  showApprovedAnswer: "Show approved answer",
  hideApprovedAnswer: "Hide approved answer",
  shareSomeDetails: "Save Answer",
  shareSomeDetailsHelp:
    "Add anything you have about this gap. Harper will use your Personal Profile and this note.",
  threadReply: "Save Answer",
  /** Exact notice while Harper is working on seeker answers. */
  processingCanTakeMinutes: "This process can take several minutes.",
  addAnotherReply: "Add another reply",
  answerGap: "Answer",
  ignoredGap: "Ignored",
  seekerSpeaker: "You",
  yourAnswer: "Your answer",
  yourReply: "Your reply",
  followUpReplyHint:
    "To answer Harper's follow-up, open Your reply, add the details she's asking for, and save.",
  newDraft: "New draft",
  editAnswer: "Edit",
  saveAnswer: "Save",
  showYourReplies: "Show your replies",
  hideYourReplies: "Hide your replies",
  skipQuestion: "Skip",
  ignoreQuestion: "Ignore",
  questionIgnored: "Ignored",
  gapIgnored: "Ignored",
  reopenIgnored: "Ignored",
  coachingDisclaimer:
    "Harper's coaching and suggestions to help you prepare and strengthen your interview skills.",
  approve: "Approve",
  useThis: "Use this",
  confirmed: "Approved.",
  changeSomething: "Change something",
  notAccurate: "Not accurate",
  changePrompt: "What should change?",
  generationFailed: `${consultationConfig.displayName} could not finish this coaching. Retry.`,
  needsMoreDetailToShape:
    "Add a bit more detail so Harper can shape this answer.",
  replyFailed: "The reply could not be sent.",
  notAcceptingReplies: `${consultationConfig.displayName} is not taking replies right now.`,
  generationQualityFailed: `${consultationConfig.displayName} could not keep one part of this coaching after checks. The rest is below. Retry the missing part.`,
  planUnusable: `${consultationConfig.displayName} could not plan this conversation. Retry.`,
  modelUnavailable: `${consultationConfig.displayName} could not start this coaching. Retry when you are ready.`,
  retry: `Retry ${consultationConfig.displayName}`,
  start: `Start with ${consultationConfig.displayName}`,
  starting: `${consultationConfig.displayName} is reading your ${vocab.product.singular} and the job…`,
  typing: `${consultationConfig.displayName} is thinking…`,
  thinking: `${consultationConfig.displayName} is thinking…`,
  whyThisCompanyTarget: "Why you want to work at this company",
  careerWalkThroughTarget: "Career walk-through",
  knowAboutMe: "Missing relevant experience for this role? Add it here",
  knowAboutMeHelp:
    `Tell ${consultationConfig.displayName} background that is not already in your ${vocab.product.singular}, for example experience that was left off the resume. This is saved as a seeker-stated fact and applies to every application.`,
  knowAboutMeSave: "Save",
  knowAboutMeSaved: `${consultationConfig.displayName} saved this to your ${vocab.product.singular} and is reassessing where you stand.`,
  knowAboutMeUnchanged: "No Changes To Your Background",
  knowAboutMeFailed: `This could not be saved to your ${vocab.product.singular}.`,
  knowAboutMeEmpty: `Write what ${consultationConfig.displayName} should know before saving.`,
  knowAboutMeTooLong: "This is too long. Shorten it and save again.",
  knowAboutMeMaxChars: 20_000,
  nextStepTitle: applicationWorkspaceCopy.nextStepTitle,
  nextStepFailed: `${consultationConfig.displayName} could not write the next step. Retry.`,
  nextStepModelUnavailable: `${consultationConfig.displayName} could not write the next step. Retry when you are ready.`,
  nextStepRetry: "Retry next step",
});

export function bestPracticeInterviewTitle(jobTitle: string | null | undefined): string {
  const title = jobTitle?.trim() || "this role";
  return `${consultationConversationCopy.bestPracticeTitlePrefix}${title}`;
}

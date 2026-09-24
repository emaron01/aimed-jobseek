/**
 * Interview-stage labels, reminder windows, and guide limits.
 * User-facing copy lives here. Generation instructions live in prompt-content.
 */

export const interviewConfig = Object.freeze({
  labels: {
    sectionTitle: "Interview stages",
    sectionHelp:
      "Record each interview, prepare a guide, and write thank-you and check-in messages after you take notes.",
    addStage: "Add stage",
    saveStage: "Save stage",
    addInterviewer: "Add interviewer",
    notesBefore: "Notes before",
    notesBeforeHelp: "What you were told to expect.",
    notesAfter: "Notes after",
    notesAfterHelp: "What was discussed and what you learned.",
    expectedDecision: "Expected decision date",
    outcome: "Outcome",
    noOutcome: "No outcome yet",
    generateGuide: "Generate guide",
    regenerateGuide: "Regenerate guide",
    skipQuestions: "Skip and generate",
    answerQuestions: "Save answers and generate",
    openGuide: "Open guide",
    printGuide: "Print or Save as PDF",
    thankYouEmail: "Thank-you email",
    thankYouLinkedIn: "Thank-you LinkedIn message",
    checkIn: "Check-in message",
    recordNotesFirst: "Record notes after the interview before generating this message.",
    consultationOffer: "A new gap from these notes can be covered in a short consultation.",
    startConsultation: "Start a short consultation",
    progressTitle: "Application status",
    staleGuide: "This guide is stale because interview information changed.",
    clarifyingHelp: "Answer or skip. These questions change how the guide is written.",
  },
  types: {
    RECRUITER_SCREEN: "Recruiter screen",
    HIRING_MANAGER: "Hiring manager",
    PANEL_COMPETENCY: "Panel or competency",
    EXECUTIVE: "Executive",
    OTHER: "Other",
  },
  formats: {
    PHONE: "Phone",
    VIDEO: "Video",
    ONSITE: "Onsite",
  },
  outcomes: {
    ADVANCED: "Advanced",
    REJECTED: "Rejected",
    WITHDRAWN: "Withdrawn",
    OFFER: "Offer",
    COMPLETED: "Completed",
  },
  progress: {
    APPLIED: "Applied",
    INTERVIEWING: "Interviewing",
    OFFER: "Offer",
    REJECTED: "Rejected",
    WITHDRAWN: "Withdrawn",
  },
  reminders: {
    defaultThankYouHours: 24,
    defaultCheckInBusinessDays: 5,
    thankYouKind: "Thank-you",
    checkInKind: "Check-in",
    recordNotesPrompt: "Record notes first, then generate the thank-you.",
  },
  clarifyingQuestionLimit: 3,
  leaveReasonUnknownLabel: "Unknown. Ask before inventing a reason.",
} as const);

export type InterviewStageTypeValue = keyof typeof interviewConfig.types;
export type InterviewFormatValue = keyof typeof interviewConfig.formats;
export type InterviewStageOutcomeValue = keyof typeof interviewConfig.outcomes;
export type ApplicationProgressValue = keyof typeof interviewConfig.progress;

export function isInterviewStageType(
  value: string,
): value is InterviewStageTypeValue {
  return value in interviewConfig.types;
}

export function isInterviewFormat(value: string): value is InterviewFormatValue {
  return value in interviewConfig.formats;
}

export function isInterviewStageOutcome(
  value: string,
): value is InterviewStageOutcomeValue {
  return value in interviewConfig.outcomes;
}

export function isApplicationProgress(
  value: string,
): value is ApplicationProgressValue {
  return value in interviewConfig.progress;
}

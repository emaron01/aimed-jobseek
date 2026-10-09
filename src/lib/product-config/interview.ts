/**
 * Interview-stage labels, reminder windows, and guide limits.
 * User-facing copy lives here. Generation instructions live in prompt-content.
 */

export const interviewConfig = Object.freeze({
  labels: {
    sectionTitle: "Interview Notes",
    sectionHelp:
      "Record each interview: who you're meeting, when, and how. After each one, add your Post Interview Notes.",
    addStage: "Add interview",
    saveStage: "Save outcome",
    interviewer: "Interviewer",
    chooseInterviewer: "Choose interviewer",
    addNewInterviewer: "Add new interviewer",
    useInterviewer: "Use this interviewer",
    addInterviewer: "Add interviewer",
    /** Harper: add a person expected to interview before a stage is scheduled. */
    addInterviewContact: "Add Interview Contact",
    interviewNotes: "Interview Notes",
    gainedInformation: "Newly gained information",
    gainedInformationHelp:
      "Paste an invitation email, or write notes about what they care about. This is saved on this person's Interview Preparation Guides section.",
    addGainedInformation: "Save and Add Note to Interview Preparation Guides",
    addNewlyGainedInformation: "Add newly gained information here",
    postInterviewNotes: "Post Interview Notes",
    reviewOpenQuestions: "Review open questions for this interview",
    noInterviewer: "Choose who you are meeting.",
    noCheatSheetSection: "Generate this person's Interview Preparation Guides section to prepare.",
    notesBefore: "Notes before",
    notesBeforeHelp: "What you were told to expect.",
    notesAfter: "Notes after",
    notesAfterHelp: "What was discussed and what you learned.",
    expectedDecision: "Expected decision date",
    outcome: "Outcome",
    savedOutcome: "Saved outcome",
    outcomeSaved: "Outcome saved.",
    noOutcome: "No outcome yet",
    generateGuide: "Generate guide",
    regenerateGuide: "Regenerate guide",
    retryGuide: "Retry guide",
    skipQuestions: "Skip and generate",
    answerQuestions: "Save answers and generate",
    exampleAnswer: "Say this",
    thankYouClarifyHelp:
      "Answer or skip. These questions give the thank-you something specific from the conversation.",
    skipThankYouQuestions: "Skip and generate the thank-you",
    answerThankYouQuestions: "Save answers and generate the thank-you",
    openGuide: "Open stage",
    startByChoosing: "Start by choosing who you're meeting.",
    addSomeoneYoureMeeting: "Add someone you're meeting",
    someoneAlreadyOnApplication: "Someone already on this application",
    aNewPerson: "A new person",
    interviewType: "Type",
    scheduleLaterHint:
      "Add a date and format to schedule this interview. You can schedule it later by picking this person.",
    newInterviewDashboardPrompt: "Have a new interview? Use",
    newInterviewDashboardLink: "I have a new interview!",
    newInterviewDashboardTail: "on the Application Dashboard,",
    newInterview:
      "Did You Land A New Interview? Click Here For Harper To Prepare Your Study Guide!",
    newInterviewCongratulations: "Congratulations on making it to the next stage!",
    buildMyPrepGuide: "Build my prep guide",
    cancelNewInterview: "Cancel",
    theirTitle: "Their title",
    theirName: "Their name",
    interviewWhen: "Date and time",
    interviewFormat: "Format",
    matchedRole: "Matching role",
    chooseRole: "Choose a role",
    createRoleFromTitle: "Create a new role from this title",
    preparingGuide: "Harper is preparing your guide…",
    viewGuide: "View guide",
    addNewContact: "Add a new contact",
    addAnotherInterview: "Add another interview",
    addFollowUpInterview: "Add Follow-up Interview",
    addFollowUpInterviewSubmit: "Add follow-up interview",
    notLinkedToAnyone: "Not linked to anyone",
    removeInterview: "Remove",
    removeInterviewCancel: "Cancel",
    removeInterviewConfirmPlain: "Remove this interview? This can't be undone.",
    removeInterviewConfirmWithNotes:
      "Remove this interview? Notes saved on this interview will be deleted. Notes saved for this person and any messages you created stay.",
    noInterviewerOnStage: "No interviewer was added to this stage.",
    savedExpectedDecision: "Expected decision date (saved earlier)",
    printGuide: "Print or save as PDF",
    thankYouEmail: "Thank-you email",
    thankYouLinkedIn: "Thank-you LinkedIn message",
    checkIn: "Check-in message",
    recordNotesFirst: "Record notes after the interview before generating this message.",
    startConsultation: "Start a short consultation",
    personPrepOffer: "Prep for this interviewer",
    personPrepStart: "Start interviewer prep",
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
  thankYouClarifyingQuestionLimit: 2,
  leaveReasonUnknownLabel: "Unknown. Ask before inventing a reason.",
  conversationNoteSignals: [
    "discussed",
    "talked about",
    "asked about",
    "asked me",
    "told me",
    "said that",
    "mentioned",
    "walked through",
    "we covered",
    "reinforce",
  ],
} as const);

/** The type Interview Notes pre-selects. A dashboard interview chooses from the role. */
export const DEFAULT_INTERVIEW_STAGE_TYPE = "RECRUITER_SCREEN" as const;

export function prepGuideReadyMessage(who: string): string {
  return `Your prep guide for ${who.trim()} is ready`;
}

export type InterviewStageTypeValue = keyof typeof interviewConfig.types;
export type InterviewFormatValue = keyof typeof interviewConfig.formats;
export type InterviewStageOutcomeValue = keyof typeof interviewConfig.outcomes;
export type ApplicationProgressValue = keyof typeof interviewConfig.progress;

export function isInterviewStageType(
  value: string,
): value is InterviewStageTypeValue {
  return value in interviewConfig.types;
}

const RECRUITER_OR_TALENT_ACQUISITION = /\b(?:recruiter|talent[- ]acquisition)\b/i;

/**
 * Recruiter and talent-acquisition titles or roles use the recruiter screen.
 * Every other role uses the general interviewer type, OTHER.
 */
export function interviewStageTypeForRole(input: {
  roleName: string;
  title: string;
}): "RECRUITER_SCREEN" | "OTHER" {
  const haystack = `${input.roleName}\n${input.title}`;
  return RECRUITER_OR_TALENT_ACQUISITION.test(haystack)
    ? "RECRUITER_SCREEN"
    : "OTHER";
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

export function isApplicationInterviewingOrLater(
  progress: string | null | undefined,
): boolean {
  return (
    progress === "INTERVIEWING" ||
    progress === "OFFER" ||
    progress === "REJECTED" ||
    progress === "WITHDRAWN"
  );
}

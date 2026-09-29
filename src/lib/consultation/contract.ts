import { z } from "zod";

export const CONSULTATION_PROMPT_VERSION = "33";

export const WHY_THIS_COMPANY_TARGET_KEY = "why-this-company";
export const PERSON_PREP_TARGET_PREFIX = "person-prep:";
/** Batch D role-expertise questions under Where you stand (targetKey prefix). */
export const ROLE_EXPERTISE_TARGET_PREFIX = "role-expertise:";
export const CHRONOLOGY_TARGET_KEY = "chronology";
/** Answers given on the Cheat Sheet (and former Stage coach items). */
export const CHEAT_SHEET_TARGET_PREFIX = "cheatSheet:";

/** WHO interview types (Geoff Smart). Internal only — never shown to the seeker. */
export const INTERVIEW_TYPE_TAGS = [
  "screening",
  "chronological_walk_through",
  "focused_competency",
  "reference_check_prep",
] as const;
export type InterviewTypeTag = (typeof INTERVIEW_TYPE_TAGS)[number];
export const interviewTypeTagSchema = z.enum(INTERVIEW_TYPE_TAGS);

export type InterviewerPrepPayload = {
  contactId: string;
  name: string;
  roleName: string;
};

const strengthSchema = z.enum(["STRONG", "PARTIAL", "NONE"]);
const strategyModeSchema = z.enum([
  "PROVE_WITH_STORY",
  "REFRAME_ADJACENT",
  "ACKNOWLEDGE",
]);

export const consultationBriefingSchema = z.object({
  overall: z.string(),
  strongestAngles: z.array(z.string()).min(2).max(3),
  importantGaps: z.array(z.string()).min(1).max(10),
  storyPlan: z.array(z.string()).max(5),
});

export const consultationPlanSchema = z.object({
  commentary: z.string(),
  briefing: consultationBriefingSchema,
  closingNote: z.string().nullable(),
  assessments: z.array(
    z.object({
      targetKey: z.string(),
      strength: strengthSchema,
      supportingFactIds: z.array(z.string()),
      relevantRoleIds: z.array(z.string()),
      explanation: z.string(),
      strategyMode: strategyModeSchema,
      strategy: z.string(),
    }),
  ),
  questions: z.array(
    z.object({
      targetKey: z.string(),
      text: z.string(),
      requirementInterpretation: z.string().nullable(),
      hiringTeamRoleId: z.string(),
      whoCaresNote: z.string(),
      interviewTypeTag: interviewTypeTagSchema,
    }),
  ),
});

const extractStorySchema = z
  .object({
    situation: z.string().nullable(),
    task: z.string().nullable(),
    action: z.string().nullable(),
    result: z.string().nullable(),
  })
  .nullable();

export const consultationExtractSchema = z.object({
  replyType: z.enum(["answer", "feedback"]),
  revisedQuestion: z.string().nullable(),
  facts: z.array(
    z.object({
      text: z.string(),
    }),
  ),
  story: extractStorySchema,
  demonstratedTargets: z.array(
    z.object({
      targetKey: z.string(),
      explanation: z.string(),
    }),
  ),
  missingStarElements: z.array(
    z.enum(["SITUATION", "TASK", "ACTION", "RESULT", "METRIC"]),
  ),
  coaching: z.string().nullable(),
  followUpQuestion: z.string().nullable(),
  gapDecision: z.enum(["evidence", "no_evidence", "incomplete"]).nullable(),
  companyMotivation: z.string().nullable(),
});

/** Interview answer frameworks (internal only — never shown to the seeker). */
export const ANSWER_FRAMEWORKS = ["CAR", "STAR"] as const;
export type AnswerFramework = (typeof ANSWER_FRAMEWORKS)[number];

/**
 * Flat polish schema (OpenAI strict root object). Exceptions use interviewAnswer;
 * non-exceptions use answerFramework plus that framework's parts. Empty/null
 * combinations are rejected in the polish quality loop.
 */
export const consultationPolishSchema = z.object({
  answerFramework: z.enum(ANSWER_FRAMEWORKS).nullable(),
  interviewAnswer: z.string().nullable(),
  challenge: z.string().nullable(),
  situation: z.string().nullable(),
  task: z.string().nullable(),
  action: z.string().nullable(),
  result: z.string().nullable(),
  resumeBullet: z.string().nullable(),
  strengtheningNote: z.string().nullable(),
});

export type ConsultationPlanResult = z.infer<typeof consultationPlanSchema>;
export type ConsultationExtractResult = z.infer<typeof consultationExtractSchema>;
export type ConsultationExtractFeedback = ConsultationExtractResult & {
  replyType: "feedback";
  revisedQuestion: string;
};
export type ConsultationExtractAnswer = ConsultationExtractResult & {
  replyType: "answer";
  gapDecision: "evidence" | "no_evidence" | "incomplete";
};
export type ConsultationPolishResult = z.infer<typeof consultationPolishSchema>;

export function isConsultationPolishPartsResult(
  value: ConsultationPolishResult,
): value is ConsultationPolishResult & {
  answerFramework: AnswerFramework;
} {
  return value.answerFramework === "CAR" || value.answerFramework === "STAR";
}

export function isConsultationExtractAnswer(
  value: ConsultationExtractResult,
): value is ConsultationExtractAnswer {
  return value.replyType === "answer" && value.gapDecision != null;
}

export function isConsultationExtractFeedback(
  value: ConsultationExtractResult,
): value is ConsultationExtractFeedback {
  return value.replyType === "feedback" && Boolean(value.revisedQuestion?.trim());
}

export type AskedConsultationQuestion = {
  text: string;
  answered: boolean;
  /** Seeker permanently dismissed this question and will not answer it. */
  ignored: boolean;
  targetKey: string | null;
  followUp: boolean;
};

export type SeekerStatedFactPayload = {
  id: string;
  kind: "FACT";
  text: string;
  source: "added_background" | "interview_learning";
};

/** Application company research sent to Coach. Null when none is usable. */
export type CoachCompanyResearch = {
  companySummary: string | null;
  whatTheySell: string | null;
  businessModel: string | null;
  companySizeContext: string | null;
  hiringSignals: string[];
  riskSignals: string[];
};

/** The built general persona for a Hiring Team role. Null until the role is built. */
export type CoachGeneralPersona = {
  definition: string | null;
  department: string | null;
  seniority: string | null;
  responsibilities: string | null;
  painPoints: string | null;
  desiredOutcomes: string | null;
  messagingNotes: string | null;
  additionalContext: string | null;
  overview: string | null;
  impact: string | null;
  pressures: string[];
  needs: string[];
  concerns: string[];
  evaluates: string[];
  talkingPoints: string[];
  communication: string[];
  interviewStage: string | null;
};

/** One person's own persona: what this individual cares about, not the role in general. */
export type CoachPersonPersona = {
  caresAbout: string[];
  talkingPoints: string[];
  /** Their own experience synthesized into what they value. Empty when too thin. */
  likelyToValue: string[];
  commonGround: Array<{
    text: string;
    seekerSource: string;
    contactSource: string;
  }>;
};

/**
 * Everything relevant from a person's LinkedIn profile, for analysis only. The
 * structured extract is sent with the full pasted text so anything the extract
 * missed, such as recent posts or recommendations, is still available.
 */
export type CoachPersonLinkedIn = {
  headline: string | null;
  about: string | null;
  currentTitle: string | null;
  currentEmployer: string | null;
  currentTenure: string | null;
  workExperience: Array<{
    employer: string | null;
    title: string | null;
    dates: string | null;
    location: string | null;
    description: string | null;
    accomplishments: string[];
  }>;
  education: string[];
  certifications: string[];
  skills: string[];
  statedFocus: string[];
  profileText: string | null;
};

/** Invitation details and anything else recorded about this person, newest last. */
export type CoachPersonNote = {
  id: string;
  text: string;
  stageId: string | null;
  recordedAt: string | null;
};

export type CoachPersonInterviewStage = {
  id: string;
  type: string;
  format: string;
  scheduledAt: string;
  expectedDecisionAt: string | null;
  outcome: string | null;
  notesBefore: string | null;
  notesAfter: string | null;
};

/** Application interview learnings for coach HM routing (Batch D7). */
export type ApplicationLearningsForCoach = {
  seekerLearnedNotes: string | null;
  stageNotes: Array<{
    stageId: string;
    notesBefore: string | null;
    notesAfter: string | null;
  }>;
  newlyGained: Array<{
    contactId: string;
    id: string;
    text: string;
    stageId: string | null;
  }>;
};

export type CoachHiringTeamPerson = {
  contactId: string;
  name: string;
  title: string | null;
  employer: string | null;
  linkedInUrl: string | null;
  roleConfirmed: boolean;
  persona: CoachPersonPersona | null;
  linkedIn: CoachPersonLinkedIn | null;
  recordedNotes: CoachPersonNote[];
  interviewStages: CoachPersonInterviewStage[];
  prepOpening: string | null;
  interviewLearnings: string[];
  /**
   * Primary application learnings — set only on the matched Hiring Manager person.
   * Never merge into persona or linkedIn.
   */
  applicationLearnings?: ApplicationLearningsForCoach | null;
  /** Same learnings as background only — set on non-HM matched people. */
  applicationLearningsBackground?: ApplicationLearningsForCoach | null;
};

/**
 * One Hiring Team role. The general persona and each matched person stay separate
 * entries: a person's own persona never replaces or merges into the general one.
 */
export type CoachHiringTeamRole = {
  id: string;
  name: string;
  likelyTitles: string[];
  whyThisRoleMatters: string | null;
  suggestionKey?: string | null;
  personaBuilt: boolean;
  persona: CoachGeneralPersona | null;
  people: CoachHiringTeamPerson[];
  /** Primary application learnings on the Hiring Manager role (with or without people). */
  applicationLearnings?: ApplicationLearningsForCoach | null;
};

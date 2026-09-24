import type { AiMessage } from "@/lib/ai/types";
import {
  INTERVIEW_CLARIFY_SYSTEM_INSTRUCTIONS,
  INTERVIEW_GUIDE_SYSTEM_INSTRUCTIONS,
  INTERVIEW_THANK_YOU_CLARIFY_SYSTEM_INSTRUCTIONS,
} from "@/lib/prompt-content";
import {
  applicationAssetConfig,
  consultationConfig,
  interviewConfig,
} from "@/lib/product-config";
import {
  INTERVIEW_CLARIFY_PROMPT_VERSION,
  INTERVIEW_GUIDE_PROMPT_VERSION,
  INTERVIEW_THANK_YOU_CLARIFY_PROMPT_VERSION,
} from "./contract";

export type InterviewGuidePromptInput = {
  stageType: string;
  format: string;
  scheduledAt: string;
  notesBefore: string | null;
  notesAfter: string | null;
  expectedDecisionAt: string | null;
  interviewers: Array<{
    contactId: string;
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    roleId: string | null;
    roleName: string | null;
  }>;
  priorStageNotes: Array<{
    stageId: string;
    type: string;
    notesAfter: string;
  }>;
  clarifyingAnswers: Array<{ id: string; question: string; answer: string }>;
  profileRoles: Array<{
    roleId: string;
    employer: string | null;
    title: string | null;
    startDate: string | null;
    endDate: string | null;
    achievements: string[];
    reasonForLeaving: string | null;
  }>;
  approvedStatements: Array<{ id: string; text: string }>;
  approvedStories: Array<{ id: string; text: string }>;
  scorecardCompetencies: Array<{ id: string; text: string }>;
  consultationGaps: Array<{ targetKey: string; text: string }>;
  personas: Array<{ id: string; name: string; text: string }>;
  sources: Array<{ id: string; category: string; text: string }>;
  qualityFeedback: string[];
};

export function buildInterviewClarifyingMessages(input: {
  missing: string[];
  qualityFeedback: string[];
}): AiMessage[] {
  return [
    {
      role: "system",
      content: `Prompt version: ${INTERVIEW_CLARIFY_PROMPT_VERSION}\n\n${INTERVIEW_CLARIFY_SYSTEM_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        consultantName: consultationConfig.displayName,
        missingInformation: input.missing,
        maxQuestions: interviewConfig.clarifyingQuestionLimit,
        bannedPhrases: [
          ...consultationConfig.bannedPhrases,
          ...applicationAssetConfig.bannedPhrases,
        ],
        qualityFeedback: input.qualityFeedback,
        responseShape: {
          questions: [{ id: "string", text: "one-sentence question" }],
        },
      }),
    },
  ];
}

export function buildInterviewGuideMessages(
  input: InterviewGuidePromptInput,
): AiMessage[] {
  return [
    {
      role: "system",
      content: `Prompt version: ${INTERVIEW_GUIDE_PROMPT_VERSION}\n\n${INTERVIEW_GUIDE_SYSTEM_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        stageType: input.stageType,
        format: input.format,
        scheduledAt: input.scheduledAt,
        notesBefore: input.notesBefore,
        notesAfter: input.notesAfter,
        expectedDecisionAt: input.expectedDecisionAt,
        interviewers: input.interviewers,
        priorStageNotes: input.priorStageNotes,
        clarifyingAnswers: input.clarifyingAnswers,
        profileRoles: input.profileRoles,
        approvedStatements: input.approvedStatements,
        approvedStories: input.approvedStories,
        scorecardCompetencies: input.scorecardCompetencies,
        consultationGaps: input.consultationGaps,
        personas: input.personas,
        citableSources: input.sources,
        allowedSourceIds: input.sources.map((source) => source.id),
        requiredWalkthroughRoleIds: input.profileRoles.map((role) => role.roleId),
        unknownLeaveReasonRoleIds: input.profileRoles
          .filter((role) => !role.reasonForLeaving?.trim())
          .map((role) => role.roleId),
        requiredCitationSourceIds: input.sources
          .filter((source) => source.category === "APPLICATION")
          .filter((source) =>
            input.priorStageNotes.some((note) =>
              source.id.includes(note.stageId),
            ),
          )
          .map((source) => source.id),
        approvedStatementIds: input.approvedStatements.map((row) => row.id),
        approvedStoryIds: input.approvedStories.map((row) => row.id),
        bannedPhrases: [
          ...consultationConfig.bannedPhrases,
          ...applicationAssetConfig.bannedPhrases,
        ],
        qualityFeedback: input.qualityFeedback,
        responseShape: {
          purpose: "claim",
          interviewers: [
            {
              contactId: "supplied contact id",
              roleId: "supplied role id",
              whoTheyAre: "claim",
              whatTheyEvaluate: "claim",
              likelyQuestions: [
                {
                  question: "claim",
                  answerMaterial: "second-person coaching claim",
                  exampleAnswer: "first-person words to say aloud",
                  statementIds: ["approved statement id"],
                  storyIds: ["approved story id"],
                },
              ],
              questionsToAsk: ["claim"],
            },
          ],
          talkingPoints: ["claim"],
          chronologicalWalkthrough: [
            {
              roleId: "supplied role id",
              employer: "exact supplied employer",
              title: "exact supplied title",
              accomplishments: ["claim"],
              reasonForLeaving: "string or empty",
              reasonUnknown: "boolean",
            },
          ],
          claim: {
            id: "unique string",
            text: "string",
            supports: [{ sourceId: "supplied source id", quote: "exact quote" }],
          },
        },
      }),
    },
  ];
}

export function buildInterviewThankYouClarifyingMessages(input: {
  notes: string;
  qualityFeedback: string[];
}): AiMessage[] {
  return [
    {
      role: "system",
      content: `Prompt version: ${INTERVIEW_THANK_YOU_CLARIFY_PROMPT_VERSION}\n\n${INTERVIEW_THANK_YOU_CLARIFY_SYSTEM_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        consultantName: consultationConfig.displayName,
        notes: input.notes,
        maxQuestions: interviewConfig.thankYouClarifyingQuestionLimit,
        bannedPhrases: [
          ...consultationConfig.bannedPhrases,
          ...applicationAssetConfig.bannedPhrases,
        ],
        qualityFeedback: input.qualityFeedback,
        responseShape: {
          questions: [{ id: "string", text: "one-sentence question" }],
        },
      }),
    },
  ];
}

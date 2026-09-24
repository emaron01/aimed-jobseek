import { z } from "zod";

export const INTERVIEW_GUIDE_PROMPT_VERSION = "2";
export const INTERVIEW_CLARIFY_PROMPT_VERSION = "1";

const supportSchema = z.object({
  sourceId: z.string().trim().min(1),
  quote: z.string().trim().min(1),
});

export const interviewClaimSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
  supports: z.array(supportSchema),
});

export const interviewClarifyingQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        text: z.string().trim().min(1),
      }),
    )
    .max(3),
});

export const interviewGuideContentSchema = z.object({
  purpose: interviewClaimSchema,
  interviewers: z.array(
    z.object({
      contactId: z.string().trim().min(1),
      roleId: z.string().trim().min(1),
      whoTheyAre: interviewClaimSchema,
      whatTheyEvaluate: interviewClaimSchema,
      likelyQuestions: z.array(
        z.object({
          question: interviewClaimSchema,
          answerMaterial: interviewClaimSchema,
          statementIds: z.array(z.string()),
          storyIds: z.array(z.string()),
        }),
      ),
      questionsToAsk: z.array(interviewClaimSchema),
    }),
  ),
  talkingPoints: z.array(interviewClaimSchema).min(1),
  chronologicalWalkthrough: z
    .array(
      z.object({
        roleId: z.string().trim().min(1),
        employer: z.string(),
        title: z.string(),
        accomplishments: z.array(interviewClaimSchema),
        reasonForLeaving: z.string(),
        reasonUnknown: z.boolean(),
      }),
    )
    .optional(),
});

export type InterviewClaim = z.infer<typeof interviewClaimSchema>;
export type InterviewClarifyingQuestions = z.infer<
  typeof interviewClarifyingQuestionsSchema
>;
export type InterviewGuideContent = z.infer<typeof interviewGuideContentSchema>;

export function interviewGuideTexts(content: InterviewGuideContent): string[] {
  const texts: string[] = [content.purpose.text];
  for (const interviewer of content.interviewers) {
    texts.push(
      interviewer.whoTheyAre.text,
      interviewer.whatTheyEvaluate.text,
      ...interviewer.likelyQuestions.flatMap((item) => [
        item.question.text,
        item.answerMaterial.text,
      ]),
      ...interviewer.questionsToAsk.map((item) => item.text),
    );
  }
  texts.push(...content.talkingPoints.map((item) => item.text));
  for (const role of content.chronologicalWalkthrough ?? []) {
    texts.push(
      ...role.accomplishments.map((item) => item.text),
      role.reasonForLeaving,
    );
  }
  return texts.filter((text) => text.trim());
}

export function interviewGuideClaims(
  content: InterviewGuideContent,
): InterviewClaim[] {
  const claims: InterviewClaim[] = [
    content.purpose,
    ...content.talkingPoints,
  ];
  for (const interviewer of content.interviewers) {
    claims.push(
      interviewer.whoTheyAre,
      interviewer.whatTheyEvaluate,
      ...interviewer.likelyQuestions.flatMap((item) => [
        item.question,
        item.answerMaterial,
      ]),
      ...interviewer.questionsToAsk,
    );
  }
  for (const role of content.chronologicalWalkthrough ?? []) {
    claims.push(...role.accomplishments);
  }
  return claims;
}

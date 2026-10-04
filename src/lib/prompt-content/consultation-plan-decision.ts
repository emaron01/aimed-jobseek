/**
 * Approved lean decision instructions for Harper planning.
 * The experimental label from the comparison script is not included.
 * Payload assembly and the prompt version stay in the consultation prompt module.
 */

import { consultationConfig } from "@/lib/product-config/consultation";

/** Build the approved decision instructions. The question cap is today's config value. */
export function buildConsultationPlanDecisionInstructions(
  questionCap: number = consultationConfig.applicationQuestionLimit,
): string {
  return `You decide strengths and questions only. Do not return fact ids, role ids, standing summary, angles, gap essays, commentary, closing note, explanation, strategy prose, who-cares note, or requirement interpretation.

Rate every target STRONG, PARTIAL, or NONE. Set strategyMode to PROVE_WITH_STORY, REFRAME_ADJACENT, or ACKNOWLEDGE. Do not invent employers, titles, metrics, or skills.

Ask one question per remaining gap, most important first. Across this application, including askedQuestions, never more than ${questionCap} questions. Never repeat or closely rephrase askedQuestions, including questions marked ignored. Question text is specific to this person's roles and this job. Do not paste requirement, responsibility, or posting text into a question. Mission statements, company taglines, and recruiting pitches are not gaps. Do not ask about a target you rated STRONG. The career walk-through comes only from recentRoles, at most once, and never for a role that ended more than 10 years ago. Never ask the person to walk through their whole career or start from their first job.

Each question has targetKey, text, hiringTeamRoleId (one supplied Hiring Team role id), and interviewTypeTag (screening, chronological_walk_through, focused_competency, or reference_check_prep). Use chronological_walk_through only for the career walk-through.

Match careerStage: for new_to_workforce or college_graduate, ask about school, internships, projects, part-time work, and activities when the profile has them; for early_career through late_career, ask about roles and results at the level of this job.

When interviewerPrep is present, this round is prep for that person. Ask only what that person will probe. Do not assess the interviewer as a skill. Do not add a question whose text is that you are preparing them for this interviewer.

When focusTargetKey is present, the first question targets it.

Return JSON matching the schema only.`;
}

export const CONSULTATION_PLAN_DECISION_INSTRUCTIONS =
  buildConsultationPlanDecisionInstructions();

/**
 * Approved lean writing instructions for Harper planning.
 * The experimental label from the comparison script is not included.
 * Payload assembly and the prompt version stay in the consultation prompt module.
 */

export const CONSULTATION_PLAN_WRITING_INSTRUCTIONS = `The decision is given in the decision object. Do not add, drop, or reword questions. Do not change strengths, strategy mode, Hiring Team role id, or interview-type tag. Write prose and choose ids for the decision's targets and questions only.

For every assessment, choose supportingFactIds only from FACT ids in the supplied personal profile, and relevantRoleIds only from the supplied role ids. The ids must support that target's strength and strategyMode. Drop any id that was not supplied. Do not invent employers, titles, metrics, or skills.

Write overall as an honest two-to-four sentence standing for this job, spoken to the person as "you". Write two or three strongestAngles, concrete advantages from the profile. Write importantGaps as observations of what is missing, never as instructions. If the decision has no remaining gaps, write one sentence that says there are no remaining experience gaps for this job.

For every assessment in the decision, write explanation and a short strategy that follows that assessment's strategyMode and uses only experience you cited. For every question, write whoCaresNote from the supplied persona, naming that role and what that person needs to hear. Write requirementInterpretation when the question is about a vague requirement; otherwise null.

Write commentary for this round, spoken as "you". Write closingNote only when the decision has no questions; otherwise null. When interviewerPrep is present, commentary is the opening the seeker sees: what this person will likely probe, which of their stories fit, and the questions for weak spots. Do not call it a question plan.

Never put an id in prose. Speak to the person as "you".

Return JSON matching the schema only.`;

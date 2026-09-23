/**
 * Hiring Team role synthesis instructions.
 * Payload assembly, version, and parsing stay in `@/lib/persona-research/prompt.ts`.
 */

export const PERSONA_SYNTHESIS_SYSTEM_INSTRUCTIONS = `You synthesize ONE Hiring Team role for a specific job at a specific employer.

Write from what this person actually does. Use the job requirement and, when it is present, company research. When company research is absent, infer the industry from the job requirement and do not invent the employer's name. Do not browse. Never mention research status, identity ambiguity, confidence scores, missing data, or any other internal system state.

The standard is a real person's job, not a restatement of the posting. For a Director of Engineering at a robotics company, overview would cover delivery, fleet reliability, team capacity, on-call load, and the hiring bar. Pressures would be what they are measured on and what keeps them up at night as it relates to this hire. Impact would say which load this hire takes off them or which outcome it lets them deliver. Needs would be what they need the new person to do in the first months, stated as outcomes. Concerns would be the specific doubts they would have about a candidate, such as ramp time, domain depth, or production ownership. Talking points would be specific things the seeker can say that connect to those pressures, including how the seeker would work with their function day to day. How to communicate would say what this person values in a conversation. A different role at a different company must be different.

Every sentence must say something specific to this role at this company. Do not restate the reporting line, a requirement, a responsibility, or a scorecard line. A sentence that only wraps one of those lines is invalid. Needs are not a copy of the requirements list.

Cover these fields:
- Overview in roleSummary: their real responsibilities and what they own.
- Pressures in organizationalPressures.
- Impact in impact.
- Needs in needsFromHire: first-month outcomes, not the requirements copied across.
- Concerns in candidateConcerns.
- Talking points in talkingPoints.
- How to communicate in communicationApproach.
- If involvement is DIRECT, interviewStage is one of: recruiter screen; hiring manager chronological walk-through; panel competency interview; executive. For the Hiring Manager, use hiring manager chronological walk-through unless the job requirement or company research states a different stage. Also say what they evaluate. If involvement is INDIRECT, interviewStage is null.

If synthesisRejection is present, the previous draft was rejected for those reasons. Write a new draft. Do not repeat the rejected sentences.

Every evidenceRefs claim has kind FACT or INFERENCE. Do not prefix overview, pressures, impact, needs, concerns, talking points, communication, or any other sentence with FACT: or INFERENCE:. Kind is stored separately.
- FACT means the job requirement or company research states it. Cite the sourceId.
- INFERENCE is a reasonable reading, including industry context when research is missing. Most of a Hiring Team role is INFERENCE. Never present an inference as a fact.

Keep this role distinct from the peer Hiring Team roles. Articulate the difference in what they own, what they are measured on, and what lands on their desk. Do not manufacture contrast when the overlap is genuine.

Do NOT score contacts. Do NOT write outreach, a resume, or interview scripts.

confidence must be exactly HIGH, MEDIUM, or LOW.
evidenceRefs entries MUST include claim (string) and kind FACT or INFERENCE. sourceIds may be empty only for INFERENCE.
negativeRoleSignals lists titles that look similar but are not this role. They are exclusions, not the role itself.
isDisqualifier means a contact matching the criterion is not this role. A requirement of the role is isRequired, not a disqualifier.

Return JSON matching the schema only (personaDraft).`;

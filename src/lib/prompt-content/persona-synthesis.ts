/**
 * Hiring Team role synthesis instructions.
 * Payload assembly, version, and parsing stay in `@/lib/persona-research/prompt.ts`.
 */

export const PERSONA_SYNTHESIS_SYSTEM_INSTRUCTIONS = `You synthesize ONE Hiring Team role for a specific job at a specific employer.

The role is one person involved in hiring or in the day-to-day work of THIS job: recruiter, HR or people partner, hiring manager, the hiring manager's executive, or a cross-functional leader. Describe that person relative to this job, not as a generic buyer and not as a persona shared across jobs.

Use only the supplied job requirement and, when present, company research. Do not browse. Do not invent an employer, a reporting line, a metric, or a stage the materials do not support.

Every claim is FACT or INFERENCE.
- FACT means the job requirement or company research states it. Cite the sourceId.
- INFERENCE is a reasonable reading of that evidence. Most of a Hiring Team role is INFERENCE. Say so on the claim. Never present an inference as a fact.

For this job, cover:
- Overview: what this person does and what they own.
- Impact: why and how this hire affects them and their work.
- What they need from the person in this role, tied to the scorecard outcomes and competencies.
- Their likely concerns about candidates.
- If they are directly involved: which interview stage they would likely appear in and what they would evaluate. Use only these stages: recruiter screen; hiring manager chronological walk-through; panel competency interview; executive. If they are only indirectly involved, leave the stage null.
- Talking points: specific points the seeker can use if this person gets involved, or if the hiring manager asks about working cross-functionally with this function.
- How to communicate with them.

Mark every item FACT or INFERENCE in evidenceRefs. FACT means the job requirement or company research states it. INFERENCE is a reasonable reading. Never present an inference as a fact.

Keep this role distinct from the other Hiring Team roles supplied as peers. Articulate the difference in scope, what they are measured on, and what lands on their desk. Do not manufacture contrast when the overlap is genuine. Pain and messaging may overlap when that overlap is real.

Do NOT score contacts. Do NOT write outreach, a resume, or interview scripts.

confidence must be exactly HIGH, MEDIUM, or LOW.
evidenceRefs entries MUST include claim (string) and kind FACT or INFERENCE. sourceIds may be empty only for INFERENCE.
negativeRoleSignals lists titles that look similar but are not this role. They are exclusions, not the role itself.
isDisqualifier means a contact matching the criterion is not this role. A requirement of the role is isRequired, not a disqualifier.
Empty arrays and nulls are correct when the evidence does not support a field. Inventing content is not.

Return JSON matching the schema only (personaDraft).`;

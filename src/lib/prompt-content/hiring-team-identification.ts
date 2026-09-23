/**
 * Hiring Team role identification instructions.
 * Payload assembly, version, and parsing stay in `@/lib/hiring-team/prompt.ts`.
 */

export const HIRING_TEAM_IDENTIFICATION_SYSTEM_INSTRUCTIONS = `You identify the people likely to be involved in ONE hire. The evidence is this application's job requirement and, when present, company research. Treat that evidence the way a product's evidence was used to suggest buyer roles: name the roles this specific job implies. Do not return a fixed set of generic roles.

Include two kinds of involvement:
- DIRECT: people in the hiring process. Examples are a recruiter, the hiring manager, the hiring manager's executive, and interview panel members. The hiring manager's likely titles come from the posting's reporting line when one is stated.
- INDIRECT: cross-functional leaders whose work this role affects or depends on, specific to THIS job. A Senior Product Engineer role at a robotics company might involve a Product Manager, a reliability or QA lead, and a hardware or robotics lead. A different job must produce different indirect roles. Omit an indirect role the evidence does not support.

For each role return:
- name
- likelyTitles
- department, or null
- involvement DIRECT or INDIRECT
- whyInvolved: why this person is involved in this hire
- evidence: one or more claims. kind is FACT when the job requirement or company research states it, and INFERENCE when it is a reasonable reading. Cite only claims grounded in the evidence. Do not invent an employer, a person, a metric, or a reporting line.

Do not draft the full persona. Do not write outreach. Return JSON matching the schema only.`;

/**
 * Individual interview-profile instructions layered on a Hiring Team role.
 * Payload assembly and parsing stay in `@/lib/contact-profile/`.
 */

export const CONTACT_INDIVIDUAL_PROFILE_INSTRUCTIONS = `You write an individual interview profile for one named person. Layer it on their Hiring Team role persona and the FACT extract from a pasted LinkedIn profile.

Write only inferences about what their background suggests they will care about in THIS interview, and talking points tailored to them. Mark every item INFERENCE and phrase it as an inference (use "their background suggests" or "this may matter"). Never speculate about personality, age, or personal life. Do not invent employers, schools, titles, or metrics that are not in the supplied facts.

Do not draft outreach. Return JSON matching the schema only.`;

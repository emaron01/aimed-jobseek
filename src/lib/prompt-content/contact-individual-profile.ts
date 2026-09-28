/**
 * Individual interview-profile instructions layered on a Hiring Team role.
 * Payload assembly and parsing stay in `@/lib/contact-profile/`.
 */

export const CONTACT_INDIVIDUAL_PROFILE_INSTRUCTIONS = `You write an individual interview profile for one named person. Layer it on their Hiring Team role persona and the FACT extract from a pasted LinkedIn profile.

Write only inferences about what their background suggests they will care about in THIS interview, and talking points tailored to them. Mark every item INFERENCE and phrase it as an inference (use "their background suggests" or "this may matter"). Never speculate about personality, age, or personal life. Do not invent employers, schools, titles, or metrics that are not in the supplied facts.

likelyToValue synthesizes their own work experience into what they are likely to value and emphasize. Read across their roles, role descriptions, and accomplishments in the extract and the pasted profile, find the methods, motions, and standards they have repeatedly built or led, and write each one as a single sentence that names the pattern and the evidence behind it, for example: "Jordan is big on hands-on training: they built the onboarding program at two employers and coached every new lead through it." Write an item only when at least two roles, or one role plus a clearly stated accomplishment, support it. One title with no description supports nothing. When the profile is too thin for any clear pattern, return likelyToValue as an empty array: never guess, never pad it with restated titles, and never write that the profile was thin.

Do not draft outreach. Return JSON matching the schema only.`;

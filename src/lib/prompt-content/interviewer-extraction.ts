/**
 * Reading pasted text about one interviewer into structured background.
 * Payload assembly and parsing stay in `@/lib/contact-profile/`.
 */

export const INTERVIEWER_EXTRACTION_INSTRUCTIONS = `You read text the seeker pasted about one person they will interview with and return that person's background as structured data. The text may be a copied LinkedIn page, a conference or company bio, a team page, a resume, or notes. Read whatever is there. Never rely on headings being present.

Work experience is the most important part. Return every role you can find, most recent first. For each role give the employer, the title, the dates as written, the location, the full description of what they did in their own words, and every accomplishment listed as a separate item. Keep the whole description; do not shorten it to a heading or a single line. When a bio describes a career in prose, read the roles out of the prose.

Also return their headline, their About or summary, education, certifications, skills, and the areas of focus they state about themselves.

Copy what the text says. Never add an employer, title, date, metric, school, or skill the text does not contain, and never infer seniority, tenure, or responsibilities that are not written. Ignore other people the text mentions, and ignore navigation, adverts, and page furniture.

Any field the text does not contain is an empty string, or an empty array for a list. Thin text simply produces a thin result; never say the text was thin and never fill a field to avoid leaving it empty.

Return JSON matching the schema only.`;

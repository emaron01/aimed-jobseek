export const RESUME_ASSET_INSTRUCTIONS = `Write a tailored resume from the supplied application context.

Every output claim must cite one or more supplied source ids and quote the exact supporting words. Never cite a job requirement as proof that the seeker has a skill or accomplishment. A seeker claim may use only PROFILE_FACT, APPROVED_STATEMENT, or APPROVED_STORY sources.

Copy every sourceId exactly, character for character, from the supplied sources. Never shorten, normalize, or reconstruct an id. Whenever a paragraph names one of the seeker's employers or titles, cite that exact experience-role source in the same paragraph.

Tailoring means selecting, ordering, and emphasizing supported evidence. Preserve strong original wording. Rewrite only for clarity, relevance, or natural phrasing. Posting language may appear only when a seeker source proves it describes the seeker.

Use the supplied header facts only. Do not add an address or contact detail. Include every supplied experience role exactly once and preserve its roleId, employer, title, dates, and location exactly. Set hidden only from the supplied hiddenRoleIds. Never omit or hide a role yourself. Do not estimate a date.

Write a concise job-specific summary. Use approved resume bullets when they are strong and relevant. Keep bullets direct and factual. Skills, education, and credentials must be supported seeker facts.

Write only as much as the evidence supports. Do not pad, repeat claims, describe the resume-writing process, or mention internal system state. Do not use any phrase from the supplied bannedPhrases list. Return structured JSON only.`;

export const COVER_LETTER_ASSET_INSTRUCTIONS = `Write a short, specific cover letter of three or four paragraphs.

Use the supplied salutation exactly. The opening sentence must make one specific point that connects a concrete, cited COMPANY_RESEARCH fact (a source that has a URL) to the seeker's own relevant experience, cited as PROFILE_FACT, APPROVED_STATEMENT, or APPROVED_STORY. Generic enthusiasm is not an opening. Do not invent company news or culture, and do not extrapolate what a company fact means beyond the cited words.

The body should use the one or two strongest supported seeker stories for the role's most important outcomes. Prefer approved statements and approved stories. Address a significant gap only when its supplied assessment strategy is ACKNOWLEDGE. Close with a clear, confident request for a conversation. If a paragraph names the posted role title or employer, cite JOB_REQUIREMENT or COMPANY_RESEARCH for that name. The closing sentence should ask for a conversation or thank the reader without restating the seeker's experience. A closing paragraph may omit citations only when it makes no claim. Any claim in the closing still requires a citation.

Match the seeker's supplied voice samples without copying their factual content. Every fact about the seeker must cite PROFILE_FACT, APPROVED_STATEMENT, or APPROVED_STORY evidence with an exact quote. Company facts must cite COMPANY_RESEARCH. Job outcomes may cite JOB_REQUIREMENT. Never use a job requirement as proof that the seeker has done something.

Copy every sourceId exactly, character for character, from the supplied sources. Never shorten, normalize, or reconstruct an id. Whenever a paragraph names one of the seeker's employers or titles, cite that exact experience-role source in the same paragraph.

Audit every factual clause before returning it. Do not call a role current when its end date is null; null means unknown. Do not turn the employer's planned work into the seeker's experience. Do not characterize a system as production or customer-facing unless a seeker source says so. Do not broaden "incident response" into an unsupported domain or scope. Mention an experience gap only when an ASSESSMENT source explicitly supports that gap. Keep each paragraph to one or two direct sentences so each citation clearly supports the text. Make the final sentence only a concise request for a conversation or a thank-you; do not add another summary of the seeker's capabilities there. If that closing makes no claim, omit citations. If it makes a claim, cite a source.

Do not mention prompts, sources, confidence, research status, missing data, or any other internal system state. Do not add unsupported metrics, scope, titles, employers, dates, skills, credentials, or achievements. Do not use any phrase from the supplied bannedPhrases list. Return structured JSON only.`;

export const ASSET_CLAIM_VALIDATION_INSTRUCTIONS = `Audit application-material claims against their cited sources.

Flag a claim when any skill, title, employer, date, credential, metric, or achievement is not supported by the cited source text. Accept a careful semantic framing that is directly entailed by the evidence: for example, reducing a failure rate and owning on-call can be described as production-reliability experience, and billing or invoice systems that the seeker shipped or rewrote may be called production systems. Do not accept a new concrete fact: for example, an API must not be called a production service unless a source says it ran in production. Flag altered numbers, inflated scope, combined facts that change meaning, and citations whose quoted words do not support the claim.

A claim may cite several sources. Each fact in the claim text needs support from at least one of those sources. An APPLICATION source supports that the seeker applied and the applied date. A JOB_REQUIREMENT source supports the posted employer, title, and stated role facts. A PERSONA source supports why that Hiring Team role is relevant. Seeker proof still requires a PROFILE_FACT, APPROVED_STATEMENT, or APPROVED_STORY source.

Do not evaluate style. Return only the claim ids that contain unsupported factual content and a concise reason. An empty violations array means every claim is supported.`;

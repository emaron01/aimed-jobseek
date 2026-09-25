export const RESUME_ASSET_INSTRUCTIONS = `Write a tailored resume from the supplied application context.

Every output claim must cite one or more supplied source ids and quote the exact supporting words. Never cite a job requirement as proof that the seeker has a skill or accomplishment. A seeker claim may use only PROFILE_FACT, APPROVED_STATEMENT, or APPROVED_STORY sources.

Copy every sourceId exactly, character for character, from the supplied sources. Never shorten, normalize, or reconstruct an id. Whenever a paragraph names one of the seeker's employers or titles, cite that exact experience-role source in the same paragraph.

Tailoring means selecting, ordering, and emphasizing supported evidence. Preserve strong original wording. Rewrite only for clarity, relevance, or natural phrasing. Posting language may appear only when a seeker source proves it describes the seeker.

Use the supplied header facts only. Do not add an address or contact detail. Include every supplied experience role exactly once and preserve its roleId, employer, title, dates, and location exactly. Set hidden only from the supplied hiddenRoleIds. Set condensed only from the supplied condensedRoleIds. A condensed role still appears with title and employer and has no bullets. Never omit, hide, or condense a role yourself. Do not estimate a date.

Write a concise job-specific summary. Use approved resume bullets when they are strong and relevant. Keep bullets direct and factual. Skills, education, and credentials must be supported seeker facts.

Write only as much as the evidence supports. Do not pad, repeat claims, describe the resume-writing process, or mention internal system state. Do not use any phrase from the supplied bannedPhrases list. Return structured JSON only.`;

export const COVER_LETTER_ASSET_INSTRUCTIONS = `Write a short, specific cover letter of three or four paragraphs.

Use the supplied salutation exactly. Copy the signerName exactly. Do not change either.

The opening paragraph makes one specific point that connects the posted role or employer to the seeker's relevant experience. Cite PROFILE_FACT, APPROVED_STATEMENT, or APPROVED_STORY for the seeker fact. When COMPANY_RESEARCH sources with a URL are supplied, cite one of those URL sources in the opening. When they are not supplied, cite a JOB_REQUIREMENT fact instead and do not invent company news, culture, or an employer identity. Generic enthusiasm is not an opening. Do not extrapolate beyond the cited words. Do not put a metric in the opening if that metric belongs in a body story.

The body must include the seeker's strongest one or two stories for the role's most important outcomes. Each of those stories needs what the seeker personally did and the result. When APPROVED_STATEMENT sources exist for those outcomes, cite at least one of them in the story paragraph; do not replace them with a thinner profile fact. Prefer approved statements and approved stories over raw profile facts. If the supplied seeker evidence is thin, write a short letter and do not invent or stretch.

Each paragraph has one purpose. Address a significant gap only when its supplied assessment strategy is ACKNOWLEDGE: give that gap its own brief paragraph tied to how the seeker would close it, mention that gap at most once, and never combine it with unrelated experience. Do not put two unrelated experiences in the same paragraph.

Keep a number in exactly one paragraph, with the story it belongs to. Do not repeat the same number in the opening and the body. Do not drop a result just to avoid repeating a number; move the number into the story paragraph instead.

Close with a concise request for a conversation or a thank-you and no restatement of the seeker's experience. A closing paragraph that makes no claim must omit citations. A closing that makes a claim still needs a citation.

If a paragraph names the posted role title or employer, cite JOB_REQUIREMENT or COMPANY_RESEARCH for that name. Whenever a paragraph names one of the seeker's employers or titles, cite that exact experience-role source in the same paragraph.

Match the seeker's supplied voice samples without copying their factual content. Every fact about the seeker must cite PROFILE_FACT, APPROVED_STATEMENT, or APPROVED_STORY evidence with an exact quote. Company facts must cite COMPANY_RESEARCH when those sources are supplied. When they are not, cite only JOB_REQUIREMENT for the posted employer, title, and stated role facts, and do not invent company facts. Job outcomes may cite JOB_REQUIREMENT. Never use a job requirement as proof that the seeker has done something.

Copy every sourceId exactly, character for character, from the supplied sources. Never shorten, normalize, or reconstruct an id.

Audit every factual clause before returning it. Do not call a role current when its end date is null; null means unknown. Do not turn the employer's planned work into the seeker's experience. Do not characterize a system as production or customer-facing unless a seeker source says so. Do not broaden "incident response" into an unsupported domain or scope. Mention an experience gap only when an ASSESSMENT source explicitly supports that gap. A story paragraph may use two sentences so the action and the result stay together. Do not mention prompts, sources, confidence, research status, missing data, or any other internal system state. Do not add unsupported metrics, scope, titles, employers, dates, skills, credentials, or achievements. Do not use any phrase from the supplied bannedPhrases list. Return structured JSON only.`;

export const ASSET_CLAIM_VALIDATION_INSTRUCTIONS = `Audit application-material claims against their cited sources.

Flag a claim when any skill, title, employer, date, credential, metric, or achievement is not supported by the cited source text. Accept a careful semantic framing that is directly entailed by the evidence: for example, reducing a failure rate and owning on-call can be described as production-reliability experience, and billing or invoice systems that the seeker shipped or rewrote may be called production systems. Do not accept a new concrete fact: for example, an API must not be called a production service unless a source says it ran in production. Flag altered numbers, inflated scope, combined facts that change meaning, and citations whose quoted words do not support the claim.

A claim may cite several sources. Each fact in the claim text needs support from at least one of those sources. An APPLICATION source supports that the seeker applied and the applied date. A JOB_REQUIREMENT source supports the posted employer, title, and stated role facts. A PERSONA source supports why that Hiring Team role is relevant. An ASSESSMENT source supports a brief acknowledged-gap claim when the claim only restates that gap and how the seeker would close it. When a claim names an employer and cites both that experience-role source and an achievement or approved statement, accept the pairing; do not require one source to contain both the employer and the result. Seeker proof of experience still requires a PROFILE_FACT, APPROVED_STATEMENT, or APPROVED_STORY source.

Do not evaluate style. Return only the claim ids that contain unsupported factual content and a concise reason. An empty violations array means every claim is supported.`;

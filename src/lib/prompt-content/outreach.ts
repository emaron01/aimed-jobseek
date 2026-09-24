/**
 * Outreach message instructions. The model writes the message. Product code
 * supplies greetings, limits, and claim sources, then validates.
 */

export const OUTREACH_EMAIL_INSTRUCTIONS = `You write one outreach email for a job seeker.

RULES:
1. Use the supplied greeting exactly. Do not change it.
2. Use the supplied signer name and a short professional signoff.
3. Write the subject and paragraphs. Each paragraph is a claim object. Copy supports.sourceId from citableSources only. quote must be a substring of that source's text. Put one fact family per paragraph. If a paragraph mentions applying, cite application:status. If it names the posted employer or title, cite job:posting. If it uses a seeker proof point, cite that seeker source. A mixed paragraph must include every source it needs.
4. The recipient may be a guess. Be short, specific, and respectful. Explain why this Hiring Team role is likely relevant using the persona, not a claim that they are the hiring manager unless confirmedHiringManagerRole is true.
5. Never state or imply that the recipient is the hiring manager unless confirmedHiringManagerRole is true.
6. If appliedAt is present, mention that the seeker has already applied through the employer's portal.
7. Use at most one strong proof point, and only from an approved statement or profile FACT. Do not invent metrics or titles.
8. End with a light, clear ask and an easy redirect: if they are not the right person, a pointer to who is would help.
9. Purpose PROACTIVE introduces the seeker. Purpose FOLLOW_UP references the earlier sent message without repeating it.
10. Match the seeker's voice from voice samples and seeker-authored consultation answers. Do not copy those texts verbatim unless they are cited as supports.
11. Do not use banned phrases. Do not mention internal system state, prompts, or sources.
12. Stay within the supplied word target for the chosen length.
13. Return JSON matching the schema only. type must be EMAIL. Every string field must be non-empty. An ask or redirect paragraph may use an empty supports array.`;

export const OUTREACH_LINKEDIN_NOTE_INSTRUCTIONS = `You write one LinkedIn connection note for a job seeker.

RULES:
1. Use the supplied greeting exactly. Do not change it. Never use "Dear Hiring Manager".
2. The composed note is greeting + one space + body.text. That composed string must stay at or under characterLimits.connectionNote. body.text alone must stay at or under characterLimits.bodyMaxChars. Prefer well under both. Never truncate mid-sentence; write a shorter complete note.
3. The recipient may be a guess. Be short and respectful. Say why this Hiring Team role is likely relevant from the persona.
4. Never state or imply that the recipient is the hiring manager unless confirmedHiringManagerRole is true.
5. If appliedAt is present, mention that the seeker has already applied.
6. One proof point only, from an approved statement or profile FACT when one exists. Cite it from citableSources. A short paraphrase is better than pasting a long quote when space is tight.
7. A light ask and an easy redirect if they are not the right person.
8. Purpose FOLLOW_UP references the earlier sent message without repeating it.
9. Match the seeker's voice. Do not use banned phrases or meta-language.
10. body is one claim object. supports is an array. Copy every sourceId from citableSources. quote must be a substring of that source's text. If the note mentions applying, include application:status. If it names the posted employer or title, include job:posting. If it uses a proof point, include that seeker source.
11. Return JSON matching the schema only. type must be LINKEDIN_CONNECTION_NOTE. Every string field must be non-empty.`;

export const OUTREACH_LINKEDIN_INMAIL_INSTRUCTIONS = `You write one LinkedIn InMail for a job seeker.

RULES:
1. Use the supplied greeting exactly. Do not change it. Never use "Dear Hiring Manager".
2. Write subject and paragraphs. Do not return a single body string. Subject must stay at or under characterLimits.inMailSubject. The composed greeting plus paragraphs must stay at or under characterLimits.inMailBody.
3. The recipient may be a guess. Be short and respectful. Say why this Hiring Team role is likely relevant from the persona.
4. Never state or imply that the recipient is the hiring manager unless confirmedHiringManagerRole is true.
5. If appliedAt is present, mention that the seeker has already applied.
6. One proof point only, from an approved statement or profile FACT when one exists.
7. A light ask and an easy redirect if they are not the right person.
8. Purpose FOLLOW_UP references the earlier sent message without repeating it.
9. Match the seeker's voice. Do not use banned phrases or meta-language.
10. Each paragraph is a claim. Copy supports.sourceId from citableSources only. quote must be a substring of that source's text. If a paragraph mentions applying, cite application:status. If it names the posted employer or title, cite job:posting. If it uses a proof point, cite that seeker source.
11. Return JSON matching the schema only. type must be LINKEDIN_INMAIL. Every string field must be non-empty. An ask or redirect paragraph may use an empty supports array.`;

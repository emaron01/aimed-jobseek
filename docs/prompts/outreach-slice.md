# Outreach slice

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

Read docs/product-vision.md and docs/refactor-map.md before starting. Follow the prompt content layer pattern in src/lib/prompt-content/. No product code may write narrative text; the model writes, product code validates and organizes.

TASK: Outreach slice. Seekers generate emails, LinkedIn connection notes, and LinkedIn InMails per Hiring Team role, with or without a known contact, open them in their own email client or copy them into LinkedIn, and get reminders after applying. Remove sales-only surfaces. Work on main. Commit and push when all checks pass.

HOW JOB-SEEKER OUTREACH WORKS (the basis for every decision below)
The main path is applying through the company's portal with the resume and cover letter. Outreach is proactive and often a guess: the seeker finds people on LinkedIn who are likely on the Hiring Team and sends a connection note or InMail, and emails only when they find an address. Interview follow-ups (a later slice) are the only messages with certain recipients. There is no contact list, no list scoring, and no connected mailbox.

1. Remove sales-only surfaces (UI only; server code stays)
- Lists: remove the Lists navigation item, list import, bulk validation, bulk scoring, and the list and companies campaign stages. No entry point may remain.
- Email Connection: remove it from navigation and the setup rail, and hide the Microsoft 365 connected-mailbox send path. Confirm the app starts and runs without MICROSOFT_* environment variables.
- The contact-bound email sequence workspace for campaigns is replaced by the outreach section below.

2. Contacts, one at a time
- Add a contact to an application: first and last name, title, email (optional), and LinkedIn URL (optional).
- Match the contact to a Hiring Team role automatically from their title, using the existing title fit and resolveContactPersonaDecision. The seeker can change it.
- The job requirement parser captures any recruiter or other contact named in the posting (name, title, email, phone) and adds them to the roster, matched to the right role. Those details are FACT from the posting. Bump the parser prompt version.
- The Contacts page lists contacts across applications, each linked to its application.

3. Applied
The seeker marks an application as Applied with a date (default today, editable). The application shows its status.

4. Outreach messages (ApplicationAsset types EMAIL, LINKEDIN_CONNECTION_NOTE, LINKEDIN_INMAIL)
- Generated per Hiring Team role. A contact is optional: when present, use their name; otherwise use a neutral greeting from configuration suited to the channel. Never "Dear Hiring Manager" on LinkedIn.
- Purpose, selected by the seeker: proactive outreach, or follow-up to a message already marked sent (the follow-up references the earlier message without repeating it).
- Proactive messages are written for a recipient who may be a guess: short and respectful, specific about why this person is likely relevant (from the persona), mentioning that the seeker has applied when Applied is marked, one strong proof point (an approved statement where one exists), a light and clear ask, and an easy way to redirect ("if you're not the right person, I'd appreciate a pointer to who is"). Never state or imply that the recipient is the hiring manager unless the contact is confirmed in that role.
- Email and InMail include a subject. Email keeps the Short, Medium, and Long options.
- LinkedIn limits come from configuration: connection note hard limit 300 characters, plus InMail subject and body limits. Verify LinkedIn's current InMail limits and state the source in your report. Output over a limit is regenerated, never truncated mid-sentence.
- Voice: use the seeker's voice samples and their seeker-authored consultation answers to match tone.
- Claim rule, fail closed, exactly as for resume and cover letter. Banned phrases, repetition, and meta-language checks apply. Use the ASSET_AI role.
- Application guidance and a per-message "What should change?" instruction apply on regeneration.

5. Sending without integration
- Email: open in Outlook web, Outlook desktop (mailto), or Gmail web with subject and body prefilled, and the To field prefilled when the contact has an email. Next to the buttons, a download button for the approved resume DOCX and a reminder to attach it.
- LinkedIn: copy buttons for the subject and body, and an Open LinkedIn profile link when the contact has a LinkedIn URL.
- Mark as sent, with a date, on every message.

6. Reminders (alerts only; nothing is ever sent or blocked)
- Defaults: day 3 and day 7. Email 4 and Repeat are blank by default. Blank is valid and means no reminder; it must pass validation and never be treated as zero.
- Anchor: the Applied date when marked; otherwise the first outreach message marked sent.
- Reminders appear on Home and in the digest through a new application reminder source. Do not write them into CampaignContact.nextDueAt.

7. Copy
Rewrite the remaining "Home", "Contacts/lists", "email", and "emails and digest" sentences in the "Remaining sales-framed copy" section of docs/refactor-map.md and mark them done.

TESTS
- No list, bulk scoring, or Email Connection entry point is reachable; the app runs without MICROSOFT_* variables.
- Single contact add matches a role from their title and accepts an override.
- A recruiter named in a posting is added to the roster, matched to the Recruiter role.
- Messages generate with and without a contact; LinkedIn never uses "Dear Hiring Manager".
- Proactive messages never claim the recipient is the hiring manager unless confirmed.
- The connection note never exceeds 300 characters; over-limit output is regenerated.
- Handoff links prefill subject, body, and To when available; the resume download appears with emails.
- Blank cadence fields validate and produce no reminder; days 3 and 7 fire from the Applied date, or from the first sent message when not applied.
- Reminders never touch CampaignContact.nextDueAt.

REPORT
All sample output must come from real model calls, not fixtures or test doubles. For the normal fixture posting: a connection note to the Hiring Manager with no contact name, an InMail to an Indirect role, an email to a recruiter named in a posting, and a follow-up email after the first was marked sent. Also migrations, prompt versions, the InMail limits with their source, files changed, and anything that could not meet this standard.

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

TASK: End-to-end walkthrough as a signed-in job seeker, locally, with real model calls. Find and fix defects. Work on main. Commit and push fixes when all checks pass.

SETUP
Start the local database and the app. Create a new job seeker account through the normal signup flow (not the dev seed). Use the AI roles in .env.local for every generation. Never print keys.

WALKTHROUGH
In a browser, as that seeker, complete the full journey and inspect every screen along the way:
1. Signup, plan selection, EULA, onboarding, and Home setup rail.
2. Personal Profile: upload the fixture resume, build, review FACT and INFERENCE items and gaps, add contact details, approve.
3. Target Employers: draft from the Personal Profile, edit, add target earnings and employment type, approve.
4. Application: paste the normal fixture posting; review the job requirement, scorecard, company research, employer fit, and override.
5. Hiring Team: Direct and Indirect groups, expand and collapse, one role in full.
6. Consultation with Harper: answer two questions (one thin, one rich), a follow-up, polished statements, approve, confirm facts.
7. Resume and cover letter: generate, view claim sources, regenerate with an instruction, approve, download DOCX and open it.
8. Contacts: add one contact manually; confirm the posting-named recruiter is on the roster.
9. Outreach: a LinkedIn connection note, an InMail, and an email; open the email handoff links; mark sent; generate a follow-up.
10. Mark Applied; confirm reminders appear on Home.
11. Interview stages: add a recruiter screen with an interviewer, generate the guide, record thin notes, answer Harper's questions, generate a thank-you, then add a hiring manager stage and generate its guide.
12. Application Summary: review and print preview.
13. Settings: cadence (blank fields), Hiring Team templates, email signature, billing page.

WHAT COUNTS AS A DEFECT
Errors (page, server, or browser console), broken layouts, dead or confusing controls, loading states that never resolve, any sales language (prospect, buyer, deal, pipeline, campaign, selling), wrong or leaked internal wording (ids, enum names, system state), generated text that fails the standards already defined (invented facts, banned phrases, repetition, generic content), and anything a first-time job seeker would find confusing.

RULES
- Fix each defect to the production standard, with a test where the defect is testable.
- Do NOT change product behavior or make product decisions. When a fix would require a decision (for example, changing a flow, removing a feature, or changing what Harper does), do not fix it; list it for me with a recommendation.
- Delete the test account and its data at the end, unless it is needed to reproduce an open decision item.

REPORT
For each step: what worked and what defects were found. For each defect: fixed (with the fix and its test) or needs a decision (with a recommendation). Include screenshots or exact text for anything that reads badly. Also files changed, commits, and a full-suite result.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

TASK: Fix verification failures that block resumes, cover letters, and Harper in production, and apply Hiring Team deduplication to existing applications. Work on main. Commit and push when all checks pass. This follows the task that added the Interview Cheat Sheet, per-person prep, the shared button standard, and the resume contact header; do not redo that work.

PART 1: Resume and cover letter verification (blocks production)
Production, with no seeker action after deploy: "The asset was not saved because its claims did not pass verification. Retry after reviewing the violations." No violations were shown, and the Resume and Cover Letter section rendered many empty bullet points. The cover letter does not generate at all.
1. Show the violations: each rejected claim, which source it was checked against, and why it failed, in plain language, with Retry and a way to fix the source (for example, confirm the fact through Harper or edit the Personal Profile).
2. Never render empty list items anywhere; empty sections show a plain empty state.
3. Claim verification by meaning: a claim is supported when its facts (numbers, employers, titles, dates, scope, and outcomes) match a Personal Profile FACT item or approved statement, even when worded differently. Verify with the model at temperature 0 against the cited source, plus deterministic checks that every number, date, employer, and title in the claim appears in the source. Word overlap alone never decides. Unsupported claims are removed or rewritten, never saved; the rest of the asset is kept.
4. Log each rejected claim with its text, cited source, and reason.
5. Cover letter: diagnose why it does not generate in production (the worker logs each job with its type, outcome, and error; check the COVER_LETTER jobs). Fix the cause, and verify locally with the worker running that a cover letter generates for a real-scale sales leadership profile against a Senior Director of Sales posting.

PART 2: Harper answer analysis must not fail the conversation (blocks production)
Production: after a seeker answer, "Consultation answer analysis did not return a fully grounded story. Retry consultation."
1. Grounding for extracted stories and facts checks meaning against the seeker's answer and Personal Profile, not word overlap: numbers, employers, titles, dates, and outcomes must match; wording may differ.
2. Partial acceptance: keep the parts of the story that are grounded, drop or ask about the parts that are not, and never fail the whole analysis because one part failed.
3. Harper's coaching reply always appears, even when story extraction fails. If a story could not be built yet, Harper says what is missing in plain language (for example, "Tell me what the result was") instead of an error.
4. Log each dropped element with its text and reason.

PART 3: Hiring Team deduplication on existing applications
Apply the meaning-based deduplication from the previous task to existing applications, not only new ones. Production showed "Customer Success Leader" twice, and "Executive Sponsor" overlapping "Executive Sales Sponsor", in role selectors for contacts and outreach. Merge duplicates on existing applications safely: keep built personas, seeker edits, linked contacts, and generated outreach attached to the surviving role.

TESTS
- A faithful paraphrase of a profile fact passes verification; a changed number, date, employer, or title fails.
- Failed verification shows each violation with its reason; no empty bullets render anywhere.
- A cover letter generates end to end with the worker running.
- A paraphrased but factually faithful Harper story passes grounding; a changed number or outcome is dropped.
- A failed extraction still produces Harper's coaching reply and a plain request for what is missing, never an error message.
- Existing duplicate roles merge, keeping personas, edits, contacts, and outreach on the surviving role.

VERIFY
With the web app and worker running locally, using a real-scale sales leadership profile (at least nine roles, month-year and year-only dates) and a Senior Director of Sales posting, watch in the browser: a resume and a cover letter generate and save; answer Harper with a paraphrase-heavy story and see coaching plus a polished result; the role selectors show no duplicate roles.

REPORT
The causes and fixes for each part, the cover letter production failure cause, real model output (the saved cover letter and one verified resume bullet with its source, and Harper's coaching and polished result for the paraphrase-heavy answer), the watched verification steps, migrations, prompt versions, files changed, and a full-suite result.

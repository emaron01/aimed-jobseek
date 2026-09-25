SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

TASK: Stop verification from blocking the product. Match how Aimed Outreach's claim guard works: flag and save, never block. Work on main. Commit and push when all checks pass.

WHY
In production, resumes and cover letters are refused ("The asset was not saved because its claims did not pass verification"), the cover letter never generates, and Harper fails after answers ("Consultation answer analysis did not return a fully grounded story"). The checks match words, not meaning, so they reject the seeker's own facts. The seeker is the source of truth: anything they have stated is true by definition, and verification exists only to catch the model inventing something the seeker never said.

PART 1: Flag and save, never block
1. Every generator (resume, cover letter, outreach messages, interview guides, the Interview Cheat Sheet, Harper's analysis and polished statements) always saves its output. No verification, grounding, or quality check may block saving or fail a job.
2. The claim check becomes a flag, as in Aimed Outreach: after generation, any model-written line containing a number, employer, title, date, credential, or outcome that the seeker never provided is flagged. The item saves normally. Flags show next to the line in plain language (for example, "This number isn't in your materials. Keep it, edit it, or remove it."), with Keep, Edit, and Remove actions. Keeping a flagged line is the seeker's decision.
3. Anything the seeker has stated (uploaded materials, Personal Profile, notes, Harper answers, confirmed statements) is true by definition. Compare facts by meaning, not wording: a paraphrase of the seeker's own fact is never flagged.
4. Text the seeker writes or edits directly in any asset is never checked or flagged.
5. Remove all other blocking quality checks and their retries (repetition, meta-language, grounding, perspective, and similar). Where one improves output, move its intent into the prompt instructions instead. Keep only the silent em dash cleanup on customer-facing output.
6. Existing assets and Harper sessions that failed because of these checks can be regenerated with Retry and now save.

PART 2: Cover letter
Diagnose why the cover letter does not generate in production (the worker logs each job with its type, outcome, and error; check the COVER_LETTER jobs). Fix the cause.

PART 3: Harper never fails after an answer
Harper's coaching reply always appears. When a story is incomplete, Harper says what is missing in plain language (for example, "Tell me what the result was"). Polished statements always save; any flagged line follows Part 1.

PART 4: Hiring Team duplicates on existing applications
Apply the meaning-based role deduplication from the previous task to existing applications. Merge safely: keep built personas, seeker edits, linked contacts, and generated outreach on the surviving role.

PART 5: No empty bullets
Never render empty list items anywhere; empty sections show a plain empty state.

TESTS
- No check can block saving or fail a job, for any generator.
- A line with a fact the seeker never provided saves and shows a flag with Keep, Edit, and Remove.
- A paraphrase of a seeker's fact is never flagged; seeker-edited text is never checked.
- A cover letter generates end to end with the worker running.
- Harper always replies after an answer.
- Existing duplicate roles merge without losing personas, edits, contacts, or outreach.
- No empty list items render.

VERIFY
With the web app and worker running locally, using a real-scale sales leadership profile and a Senior Director of Sales posting, watch in the browser: a resume and a cover letter generate and save on the first try; answer Harper with a short answer and a paraphrase-heavy answer and see coaching both times; a deliberately invented number in a test generation shows as a flag and the item still saves.

REPORT
Every check removed or converted, the cover letter failure cause, the watched verification steps, real model output (the saved cover letter, and Harper's replies to both answers), migrations, prompt versions, files changed, and a full-suite result.

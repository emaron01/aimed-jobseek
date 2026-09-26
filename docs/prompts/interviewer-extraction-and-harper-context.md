# Interviewer extraction, profile rebuild, and Harper context

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below.

TASK: Make interviewer background extraction work on any pasted text, rebuild existing profiles, and finish the Harper context work. Work on main. Commit and push when all checks pass.

PART 1: Extraction from any pasted text
The seeker pastes text about an interviewer: a copied LinkedIn page, a bio, a company team page, or a document. Product code never reads URLs. Today extractLinkedInFacts finds information by matching LinkedIn section headings, so text in any other format yields little or nothing.
1. Replace the heading-based parser with a model extraction using the existing AI role for contact profiles. It reads whatever was pasted and returns: work experience (for every role: employer, title, dates, location, and the full description and accomplishments), headline, About or summary, education, certifications, skills, and stated areas of focus.
2. Work experience is the most important part: capture every role completely, not just headings.
3. Fields the text does not contain stay empty. Nothing is blocked or flagged; thin text simply produces a thin extract.
4. Extracts saved in the old shape still load.

PART 2: Rebuild existing profiles
For every person who already has pasted text, re-run the extraction and the individual profile (including the likelyToValue synthesis) from the stored text now, so existing people such as Christina Schivley get full fields and their synthesis without re-pasting.

PART 3: Finish the Harper context work
Report the status of each item below, and implement any that are not done:
1. Extract and Polish receive the full Personal Profile.
2. The check requiring result wording to come only from the seeker's replies is removed.
3. Coach receives the application's company research.
4. Payload order supports prompt caching: Personal Profile and company research first.
5. The consultation prompt version is bumped.

PART 4: Label
Rename the "Paste LinkedIn profile" field to "Paste Interviewer Profile" everywhere it appears (interview stages, Add a Person, and contacts), via the vocabulary module.

TESTS
- A pasted LinkedIn page, a pasted bio, and a pasted team-page paragraph each produce an extract with work experience.
- Thin pasted text produces a partial extract with no error.
- Existing people with pasted text are re-extracted and get their likelyToValue synthesis without re-pasting.
- Each Part 3 item is covered by a test.
- The field reads "Paste Interviewer Profile" everywhere it appears.

REPORT
The extraction output for a LinkedIn paste and a bio paste, how many existing profiles were rebuilt, Christina Schivley's likelyToValue after the rebuild, the status of each Part 3 item, files changed, and a full-suite result.

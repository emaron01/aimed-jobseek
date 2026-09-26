Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

TASK: Make the Hiring Team page clear that personas are assumptions, and let the seeker correct them and add who is interviewing. Work on main. Commit and push when all checks pass. Change nothing else.

1. Rename "Review the hiring team" to "Review Hiring Personas – Add Who Will Be Interviewing" everywhere it appears: the page header, the side navigation step, and the overview's step list (via the vocabulary module).
2. The page's intro text states plainly that these personas are Harper's best guess from the job posting and company research, and that the seeker's input is needed to confirm or correct them.
3. The seeker can move a persona between Direct and Indirect.
4. At the top right of each persona card, next to the persona's name, show two buttons:
   - Edit
   - "I know who is interviewing me in this group", which opens Add a Person for that persona: first name, last name, and title required; email and LinkedIn optional. No field may require LinkedIn.
   Remove the existing Add person button at the bottom of the card.
5. The collapsible section below each persona's summary that repeats the persona's name becomes "[persona name] Details", so it is clear it holds the detailed information.

TESTS
- The new name appears in the page header, side navigation, and overview.
- The intro states that personas are assumptions needing the seeker's input.
- A persona can be moved between Direct and Indirect.
- Edit and "I know who is interviewing me in this group" appear at the top right of each card; the second opens Add a Person with LinkedIn and email optional.
- The details section reads "[persona name] Details".

REPORT
What changed, a screenshot of the Hiring Team page, files changed, and a full-suite result.

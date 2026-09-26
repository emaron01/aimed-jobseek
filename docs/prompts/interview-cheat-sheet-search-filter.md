Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.
PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
TASK: Add a searchable filter to the Interview Cheat Sheet. Work on main. Commit and push when all checks pass. Change nothing else.
1. At the top of the Interview Cheat Sheet, add a searchable filter for people and personas. Typing matches a person's name, a persona's name, or a title.
2. Selecting a match shows only that person's or persona's section, so the seeker can focus on who they are interviewing with. Clearing the filter shows every section again.
3. Printing or saving as PDF while filtered includes only the filtered section.
TESTS
- Searching by person name, persona name, and title finds the right section.
- Selecting a match shows only that section; clearing shows all.
- Printing while filtered includes only the filtered section.
REPORT
What changed, a screenshot of the cheat sheet filtered to one person, files changed, and a full-suite result.

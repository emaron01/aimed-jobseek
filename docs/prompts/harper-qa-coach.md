SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

TASK: Rebuild the Harper page as a simple question-and-result coach, like Matthew's Q&A: Harper asks, the seeker answers, the result is stored, and it can be changed later. Harper is the product's core; the page must be simple, elegant, intuitive, and useful. Work on main. Commit and push when all checks pass. Change nothing else.

1. One question at a time: Harper asks one question. The current question sits at the bottom of the page with the answer box.
2. One follow-up at most: if Harper needs more information to produce a result, she may ask one follow-up question, then produces the result.
3. What stays on the page for each answered question: Harper's question and Harper's result: the resume bullet and the talking point (interview answer) built from the seeker's answer. Questions and results are always visible, not collapsible.
4. The seeker's own answer is stored and collapsed under its question, so it can be looked up.
5. Each result has Approve and Regenerate. The seeker can return later to regenerate or approve a different version.
6. Remove the navigation buttons at the top of the Harper page (Review and edit the job requirements, Review this Resume against the job, Review the hiring team, Generate, Generate guide, Generate cheat sheet, Update application date and status, Personal Profile). The side navigation already provides them.
7. "Where you stand" and its evidence stay as they are, below the questions and results.

TESTS
- Harper asks one question at a time and at most one follow-up before producing a result.
- Each answered question shows the question, the resume bullet, and the talking point; the seeker's answer is collapsed and can be expanded.
- Approve and Regenerate work on each result.
- The navigation buttons no longer appear on the Harper page.
- "Where you stand" still renders below.

REPORT
What changed, a screenshot of the Harper page with at least two answered questions and the current question, files changed, and a full-suite result.

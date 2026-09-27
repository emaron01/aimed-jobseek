# Prompt: Harper permanent Ignore on questions

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below. Production code only: no repair or migration of existing data.

TASK: Add a permanent Ignore to Harper's questions. Work on main. Commit and push when all checks pass.

FIRST: Report how the existing Skip on a Harper question behaves today (whether a skipped question can come back, and how Harper treats it). If Skip already meets every rule below, report that and change nothing.

REQUIRED
1. Every unanswered Harper question has an Ignore action next to Reply and Skip.
2. Ignoring a question removes it from the seeker's question list for good on that application.
3. Harper is told the question was ignored and will not be answered: it is included in askedQuestions marked as ignored, and Harper never asks it again or a close rephrasing of it.
4. An ignored question counts as handled for the Harper step color: Harper can be green with ignored questions.
5. If the ignored question was about a gap, the gap itself stays in "Where you stand" with Share some details available; only the question is gone.

TESTS
- Ignore removes the question from the list permanently.
- Harper receives the question as ignored and does not ask it again or a close rephrasing.
- Harper is green when every remaining question is answered and the rest are ignored.
- The gap behind an ignored question still shows with Share some details.

REPORT
How Skip behaved before, what changed, files changed, and a full-suite result.

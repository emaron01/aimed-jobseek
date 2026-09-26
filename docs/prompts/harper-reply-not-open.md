SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

TASK: Fix Harper refusing replies. Work on main. Commit and push when all checks pass. Change nothing else.

Production: on the Harper page, the seeker replied to "At OpenText or Login VSI, tell me about a sales manager—or an emerging manager—you developed..." and got "That question is not open." The page showed a Reply box for that question.

1. Find why the reply action treats this question as not open while the page shows it as answerable.
2. Every question the page shows with a Reply box must accept a reply, and Harper responds to it (a vague answer gets her one follow-up, as designed). A question that cannot accept a reply never shows a Reply box.
3. The seeker never sees system wording such as "That question is not open."
4. Fix existing applications affected by the same mismatch.

Verify on a copy of an existing application with answers from before the ten-question change, with the web app and worker running locally: reply to each open question, including with a deliberately vague answer, and confirm Harper responds.

TESTS
- Every question showing a Reply box accepts a reply and gets Harper's response.
- A vague reply produces one follow-up.
- No seeker-facing text says a question is not open.

REPORT
The cause, the fix, what was corrected on existing applications, files changed, and a full-suite result.

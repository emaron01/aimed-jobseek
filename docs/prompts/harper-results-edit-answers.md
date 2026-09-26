Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

TASK: Fix Harper's results for answered questions, and let the seeker edit answers. Work on main. Commit and push when all checks pass. Change nothing else.

Production, on the question "At OpenText or Login VSI, tell me about a sales manager... you developed...":
- The "Interview answer · Draft" is the seeker's raw replies pasted together, not a statement Harper wrote. The "Resume bullet · Draft" is a single fragment: "The manager later became an RVP of North America Channels running a team."
- The seeker had just given a new answer, but the result shown reflects earlier answers, not the new one.
- Every reply the seeker has ever given to this question is merged into one "Your answer".

1. Results are always written by Harper: a polished resume bullet and a polished first-person interview answer, built from the seeker's answers to that question (including their answer to a follow-up). Find why the seeker's raw text was shown as the result, and fix it. Never display the seeker's own text as Harper's result.
2. A new answer produces a new result. Find why the result did not update after the latest answer, and fix it.
3. Answers are shown as separate entries in the order given, not merged into one block.
4. Edit answers: the seeker can edit any answer they gave. Saving an edit regenerates Harper's result for that question.
5. Repair existing applications affected by these defects, so their results are rewritten by Harper from their answers.

Verify on a copy of the CSC-like application with multiple replies to one question, with the web app and worker running locally: give a new answer and see a new Harper-written result; edit an answer and see the result regenerate.

TESTS
- Results are Harper-written statements, never the seeker's raw text.
- A new answer produces a new result.
- Answers show as separate entries in order.
- Editing an answer saves it and regenerates the result.

REPORT
The cause of each defect, the fix, the rewritten result for the manager-development question, files changed, and a full-suite result.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

TASK: Fix Harper page defects seen in production, then run a resume and cover letter model comparison. Work on main. Commit and push when all checks pass. Change nothing else.

PART 1: Harper page defects (on an existing application after the ten-question change)
1. Approve never completes: clicking Approve on a result spins indefinitely. The worker log shows the job succeeded in 407 ms, so the page never detects that the job finished. Find the cause and fix it.
2. Mismatched results: the question "What specifically draws you to CSC..." shows a resume bullet and interview answer about the OpenText ARM go-to-market rebuild, which answered a different question. Existing answers and results from before the change were attached to the wrong questions. Attach each existing answer and result to the question it actually answered. If an existing answer cannot be matched to a drafted question, show it as its own answered question with its original question text.
3. Missing answer box: the question about developing a sales manager has no place to answer. Every unanswered question must have an answer box.
4. "Tell me what happened, what you did, and what the result was." appears as its own question with no context and no answer box. Find where this text comes from. A follow-up must appear under the question it follows up on, written by Harper for that question, with its own answer box.
5. "The plan for this conversation is complete" shows while questions remain unanswered, and Harper's thinking indicator keeps showing with no job running. Both must reflect the real state.

Verify on a copy of an existing application that had answers from before the ten-question change, with the web app and worker running locally.

WORKER LOG FROM CLICKING APPROVE:
[research-worker] application job cmuigqdfz0003q02nt4r677n6 type=CONSULTATION application=cmuh9a2w5005lko2nzbo1g6qt durationMs=407 outcome=succeeded

PART 2: Resume and cover letter model comparison (report only; no code, configuration, or data changes)
Using the seeker's resume and the CSC Senior Director of Sales posting, generate the same resume and the same cover letter twice, locally, with the current prompts:
1. With gpt-5.6-terra (the current ASSET_AI model).
2. With gpt-5.6-luna.
Keep every other setting identical. Do not save these outputs to any application. Do not judge quality; the seeker will.

TESTS (Part 1)
- Approve completes and shows the approved state.
- Existing answers and results appear under the question they answered.
- Every unanswered question and every follow-up has an answer box.
- The completion message and thinking indicator match the real state.

REPORT
Part 1: the cause of each defect, the fix, a screenshot of the corrected Harper page, files changed, and a full-suite result.
Part 2: both resumes and both cover letters in full, side by side, labeled by model; for each generation, input tokens, cached input tokens, output tokens, duration, and cost from the AI model rate table; and the cost difference per resume, per cover letter, and per application.

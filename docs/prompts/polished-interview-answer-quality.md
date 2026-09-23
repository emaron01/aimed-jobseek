# Fix polished interview answer quality

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

TASK: Fix polished interview answer quality. Work on main. Commit and push when all checks pass.

PROBLEM
With a short seeker answer, the polished interview answer pads to meet the 80-word minimum by restating the same facts ("The task in this example was invoice generation with failed billing runs at 8%... The starting point was the 8% failure rate, and the comparison point was the rate after two quarters"). Grounding correctly forbids adding facts, so the length minimum forces repetition.

REQUIRED
1. Remove the minimum word count. Keep a maximum. The interview answer is as long as the seeker's facts support and no longer.
2. Before writing a polished interview answer, check whether the answer has enough substance for each STAR part (Situation, Task, Action, Result). When a part is thin (for example, the Action is a single phrase such as "led the rewrite"), Harper asks a natural follow-up for that part first (for example, what the seeker personally did, what options they weighed, who they worked with) instead of producing a padded answer.
3. When the seeker declines the follow-up, produce a short, honest interview answer from what exists, and show Harper's note on which part would make it stronger.
4. Add a quality check that rejects and regenerates output with: restated facts (the same fact or number appearing more than once without adding information), meta-language about the answer itself ("the task in this example was", "the starting point was", "the comparison point was", "providing the measurable result"), and sentences that describe the STAR structure instead of telling the story. Keep these phrase patterns in configuration with the banned-phrase list.
5. The interview answer must read as natural first-person speech: how a confident professional would tell this story out loud.
6. Bump the consultation prompt version.

TESTS
- A three-sentence answer produces a follow-up for the thin STAR part, not a padded answer.
- Declining the follow-up produces a short answer with no repetition and a note on what would strengthen it.
- Output with a repeated fact or meta-language is rejected and regenerated.
- A rich answer still produces a complete interview answer within the maximum.

REPORT
Real model output (actual calls): the three-sentence invoice answer and Harper's follow-up; a declined follow-up and the resulting short answer; and a rich answer with its polished interview answer. Also the prompt version and files changed.

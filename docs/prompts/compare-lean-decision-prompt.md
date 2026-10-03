Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. This task changes only the model comparison script (scripts/compare-models.ts and src/lib/model-comparison/). It changes no live application behavior, no live AI instructions or prompt versions, no model settings, no schema, and no data. The new experimental instructions live only in the comparison code and are reported in full for the product owner's approval before any production use. The script must never write to the database, never enqueue anything, and never run from a page, job, or schedule. Never silence type or lint errors. Low-risk (script only): deploy in this task only if every check passes.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do NOT use C:/Repos/aimed-jobseek (it is on an old branch). Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1. Run git fetch, then create a new worktree and a new branch from origin/main named feat/compare-lean-decision. If origin/main does not include 58bc2ea (the --fresh and split comparison options), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Add only the lean-decision variant below, then deploy. Change nothing else. Add no features.

ITEM: Lean-decision variant in --mode split
Add a fourth planning variant to --mode split, shown after the existing three (today's terra, the current split, today's luna), labeled "Lean split: terra questions and strengths, then luna":
1. A gpt-5.6-terra decision call whose schema contains only: for each target, targetKey, strength (STRONG, PARTIAL, or NONE), and strategyMode; and the questions, each with targetKey, text, hiringTeamRoleId, and interviewTypeTag. No fact ids, role ids, or prose. Its instructions keep every question rule from the current experimental decision instructions (one question per remaining gap, most important first, the 25-question limit including askedQuestions, no repeats or close rephrasing, specific to this person's roles and this job, no pasted posting text, no questions on STRONG targets, the career walk-through rule, careerStage matching, interviewerPrep and focusTargetKey handling, no invented facts).
2. A gpt-5.6-luna call that receives that decision plus the same context, and returns supportingFactIds and relevantRoleIds for each target (chosen only from the supplied fact and role ids, supporting that target's strength and strategy mode) and every writing field the current split's writing call produces. It must not add, drop, or reword questions, or change any strength, strategy mode, Hiring Team role id, or interview-type tag.
3. Combine both into the same shape as today's planning output, and report the readable output (questions, strengths, chosen fact and role ids, and prose) plus, for each call, input, output, reasoning, and cached tokens, provider calls, and cost at the stored rates, and the lean split's total next to today's terra and the current split's totals.
4. Include the lean decision and lean writing instructions in full in the report, labeled experimental and not in production.

TESTS
Add automated tests (mocked providers, real Postgres) that assert: --mode split now runs four variants in the stated order with the right models; the lean decision schema contains only targetKey, strength, strategyMode, and the four question fields; the lean writing call receives the decision, returns fact and role ids drawn only from the supplied ids, and cannot change questions, strengths, strategy modes, role ids, or tags (a changed value is rejected or restored from the decision, and the report says which); the combined result matches today's planning shape; costs are reported per call and in total; no database rows are created or updated and nothing is enqueued; no environment setting or production prompt version changes; existing variants and options behave as before. Run npm test (default parallelism, including real-Postgres tests; database up, not in parallel with the build), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

DEPLOY (only if every check above passes with zero errors)
1. Commit on feat/compare-lean-decision with a message naming the lean-decision comparison variant, and push the branch.
2. Run git fetch. Confirm origin/main is unchanged since this branch was created and the only commit in origin/main..feat/compare-lean-decision is this commit. Otherwise STOP and report; do not deploy.
3. Fast-forward origin/main to that commit by pushing it to main (fast-forward only; never force). If a fast-forward is not possible, STOP and report.
4. Confirm no migrations are in the range.
If any check fails, do not deploy: report the failure and leave the branch pushed.

REPORT
1. The lean variant: how it works, with file and line, and the experimental instructions in full.
2. Every file changed.
3. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
4. The commit hash; main before and after; confirmation the push was a fast-forward (or that nothing was deployed, and why).
5. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside the script changed.
6. The exact Render shell command to run.

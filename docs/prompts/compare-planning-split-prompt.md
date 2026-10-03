Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only, per Batch 1 of docs/prompts/planning-split-plan-report.md on branch plan/planning-split (worktree C:/Repos/aimed-jobseek-planning-split-plan). This task changes only the model comparison script (scripts/compare-models.ts and src/lib/model-comparison/), plus any read-only message builders it needs that are reused, not duplicated. It changes no live application behavior, no live AI instructions or prompt versions, no model settings, no schema, and no data. Any new decision or writing instructions used by the split mode live only in the comparison code for this experiment and are reported in full for the product owner's approval before any production use. The script must never write to the database, never enqueue anything, and never run from a page, job, or schedule. Never silence type or lint errors. Low-risk (script only): deploy in this task only if every check passes.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do NOT use C:/Repos/aimed-jobseek (it is on an old branch). Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1. Run git fetch, then create a new worktree and a new branch from origin/main named feat/compare-planning-split. If origin/main is not e40d055 or later with scripts/compare-models.ts present, STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Add only the two options below, then deploy. Change nothing else. Add no features.

ITEM 1: --fresh
With --fresh, the planning and questions steps build their inputs exactly as production would for this application's first Harper round: as if the application had no consultation turns, Harper questions, answers, or best-practice questions yet (in memory only; stored data is read, never changed). The Personal Profile, job requirement, employer research, and Harper library are included exactly as production would include them for a first round. Under --fresh, the questions step runs (its question-limit skip uses the simulated empty state). Without --fresh, behavior is unchanged. Report how the first-round input is built and confirm it matches production's first round.

ITEM 2: --mode split (planning only)
With --mode split, the planning step runs three variants on the same input and reports them side by side: (a) today's planning on gpt-5.6-terra; (b) the split: a terra decision call returning only the judgment fields (which targets are strong, partial, or none; fact and role ids; the strategy mode; each question's text, target, Hiring Team role, and interview-type tag), followed by a luna writing call that writes every writing field (standing summary, angles, gap prose, commentary, closing note, explanation, strategy prose, who-cares note, requirement interpretation) from that decision plus the needed context; (c) today's planning on gpt-5.6-luna. For each variant, report the readable output (questions and prose), input tokens, output tokens, and reasoning tokens separately when the provider returns them (for example output_tokens_details.reasoning_tokens), cached tokens, provider calls, and cost at the stored rates, plus the split's total. Report whether reasoning tokens are part of billed output tokens. Include in the report the full decision and writing instructions the split used, labeled as experimental and not in production.

TESTS
Add automated tests (mocked providers, real Postgres) that assert: --fresh builds production's first-round inputs for an application that already has turns and questions, including the profile, job requirement, research, and library, and the questions step runs; --mode split runs the three variants with the right models, the decision call's schema contains only the judgment fields, and the writing call receives the decision; reasoning tokens are reported separately when present; no database rows are created or updated and nothing is enqueued (row counts and updatedAt unchanged); no environment setting or production prompt version changes; without the new options, behavior is unchanged. Run npm test (default parallelism, including real-Postgres tests; database up, not in parallel with the build), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

DEPLOY (only if every check above passes with zero errors)
1. Commit on feat/compare-planning-split with a message naming the --fresh and split comparison options, and push the branch.
2. Run git fetch. Confirm origin/main is unchanged since this branch was created and the only commit in origin/main..feat/compare-planning-split is this commit. Otherwise STOP and report; do not deploy.
3. Fast-forward origin/main to that commit by pushing it to main (fast-forward only; never force). If a fast-forward is not possible, STOP and report.
4. Confirm no migrations are in the range.
If any check fails, do not deploy: report the failure and leave the branch pushed.

REPORT
1. ITEM 1 and ITEM 2: how each works, with file and line; the experimental decision and writing instructions in full; and whether reasoning tokens are billed as output.
2. Every file changed.
3. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
4. The commit hash; main before and after; confirmation the push was a fast-forward (or that nothing was deployed, and why).
5. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside the script changed.
6. The exact Render shell command to run: npx tsx --conditions=react-server scripts/compare-models.ts --campaign cmusnhmeu000vr52o68tvs6oy --steps planning --fresh --mode split

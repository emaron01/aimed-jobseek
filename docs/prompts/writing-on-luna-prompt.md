Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Use existing AI provider configuration; do not add new environment variables. No temporary fixes, no data repair, no migrations, no schema changes, no prompt wording changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub or any other in-progress branch. Create a new branch from main named fix/writing-on-luna. If main does not yet include 9d2eef8 (the Harper model split), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Move only the writing steps below to the writing model. Change nothing else. Add no features.

PRODUCT OWNER DECISION
All writing runs on the writing model (gpt-5.6-luna). Thinking and judgment (planning, choosing questions, assessing fit, identifying roles, research, validation of claims) stay where they are. The writing steps flagged by the model-split audit are: Cheat Sheet person guidance, resume, cover letter, outreach drafts, and thank-you and check-in (including their clarifying questions).

FOR EACH WRITING STEP
1. Report which provider function and which model environment variable it uses today, and every other step that uses the same provider or variable, marking each as thinking or writing.
2. If that provider or variable is used only by writing steps, make no code change: report the exact Render environment variable name and the value gpt-5.6-luna for the product owner to set, and on which services (web, worker, or both).
3. If it is shared with any thinking step, route only the writing step to the existing writing provider (the provider already configured for gpt-5.6-luna, such as the consultation reply provider or an existing asset or email writing provider), leaving every thinking step on its current provider. Report the change with file and line.
4. Claim validation for resume, cover letter, and outreach is judgment, not writing: leave it on its current provider unless it shares a variable that forces a change; report it either way.
5. Confirm the paid-call gate fingerprints for each moved step include the model or provider (so a model change is treated as a real input change) or report that they do not; do not trigger any automatic regeneration.

TESTS
Add automated tests that assert each writing step above uses the writing provider (or the provider whose model setting the product owner will set to luna), every thinking step is unchanged, claim validation is unchanged, and nothing regenerates automatically or on a page view. Run the worker boundary test (--conditions=react-server). Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors. If the known load flake in paid-call-advisory-lock.test.ts ("different subjects run in parallel") fails under the full suite, re-run it alone and report it; any other failure must be fixed. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/writing-on-luna with a message naming the move of all writing steps to the writing model, and push that branch. Do not merge into main or push main. If no code change was needed for any step, commit only the saved prompt and report.

REPORT
1. A table: each writing step, its provider and variable before and after, and whether it needed a code change or a Render setting.
2. The exact Render environment variables and values the product owner must set, and on which services.
3. Claim validation findings.
4. The fingerprint finding for each moved step.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; flakes by name; the worker boundary test result; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside this move changed.

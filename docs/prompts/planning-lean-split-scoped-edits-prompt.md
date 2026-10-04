Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Production-grade code only. The only instruction changes allowed are the four approved edits below; no other wording may change. No schema changes or data repair. Every paid call stays behind the paid-call gate. Nothing runs on a page view or reruns on its own. Deploy only work whose full test suite, worker boundary test, production build, type check, and lint pass, run against exactly the commit being deployed, in its worktree. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, rebase, or any command that discards or moves uncommitted work. Do NOT use C:/Repos/aimed-jobseek (it is on an old branch). Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1. Work in C:/Repos/aimed-jobseek-planning-lean-split on feat/planning-lean-split (at 2bd8f18), committing on top of it. If anything unexpected happens, STOP and report.
SURGICAL RULE
Apply only the four edits below, then deploy. Change nothing else. Add no features.
APPROVED EDITS (exact)
1. In CONSULTATION_PLAN_DECISION_INSTRUCTIONS, replace the sentence "Ask only what this interviewer will likely probe, which of their stories fit, and one or two new questions for weak spots with this interviewer." with exactly:
When interviewerPrep is present, ask only what this interviewer will likely probe, which of their stories fit, and one or two new questions for weak spots with this interviewer.
2. In CONSULTATION_PLAN_WRITING_INSTRUCTIONS, replace the sentence "Ground it in that person's entry, persona, LinkedIn, notes, invitation, stages, and learnings, read alongside the role's generalPersona." with exactly:
When interviewerPrep is present, ground the commentary in that person's entry, persona, LinkedIn, notes, invitation, stages, and learnings, read alongside the role's generalPersona.
3. In CONSULTATION_PLAN_DECISION_INSTRUCTIONS, replace the sentence "Never repeat or rephrase any of them, including career walk-through and interviewer-prep questions." with exactly:
Never repeat or rephrase askedQuestions, including career walk-through and interviewer-prep questions.
4. In CONSULTATION_PLAN_WRITING_INSTRUCTIONS, replace the sentence "Write these yourself from the assessment." with exactly:
Write importantGaps yourself from the assessment.
Bump CONSULTATION_PLAN_DECISION_PROMPT_VERSION and CONSULTATION_PLAN_WRITING_PROMPT_VERSION to "3", and report what that triggers (nothing reruns on its own or on a page view).
TESTS
Update planning-lean-split.test.ts to assert the four edited sentences exactly as above, that the replaced sentences no longer appear, and versions "3"; every other assertion stays. Run npm test (default parallelism, including real-Postgres tests; database up, not in parallel with the build), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, in the worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.
DEPLOY (only if every check above passes with zero errors)
1. Commit on feat/planning-lean-split with a message naming the scoped interviewer-prep and reference fixes in the planning instructions, and push the branch.
2. Run git fetch. Report origin/main's commit. If feat/planning-lean-split does not contain origin/main, merge origin/main into it (merge, not rebase); if there is any conflict, STOP and report; then rerun every check above at the merged tip and STOP on any failure.
3. Confirm the only non-merge commits in origin/main..feat/planning-lean-split are 66836db (lean planning split and separate model settings), 2bd8f18 (restored coaching rules), and this commit. Otherwise STOP and report.
4. Fast-forward origin/main to the tip of feat/planning-lean-split by pushing it to main (fast-forward only; never force). If a fast-forward is not possible, STOP and report.
5. Confirm no migrations are in the range.
If any check fails, do not deploy: report the failure and leave the branch pushed.
REPORT
1. The four edits as applied, and the version change with what it triggers.
2. Every file changed.
3. Tests changed, with reasons; each check's command, exit code, and result, run after the final edit (and after any merge).
4. The commits in the range; main before and after; confirmation the push was a fast-forward (or that nothing was deployed, and why).
5. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these edits changed.
6. What the product owner should check in Render: the build succeeded, both services are running, and starting Harper on a new application produces questions and the standing summary.

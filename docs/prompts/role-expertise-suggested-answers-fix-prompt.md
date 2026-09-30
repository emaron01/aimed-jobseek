# Role-expertise suggested answers fix

Save this prompt to docs/prompts/ before starting.

## SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

## PRODUCTION STANDARD
Production-grade code only. Find and fix the root cause; no temporary fixes, no data repair, no migrations, no schema changes, no Harper prompt changes. Never silence type or lint errors.

## GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub or the fix/harper-standing-structure branch. Create a new branch from main (currently 1623a52, in production) named fix/role-expertise-suggested-answers. If anything unexpected happens, STOP and report.

## SURGICAL RULE
Fix only the missing role-expertise suggested answers. Change nothing else. Add no features.

## DEFECT
In production, the role-expertise questions under Where you stand (for example "Describe how you partner with Marketing to improve demand generation for an enterprise sales organization." and "What would your first 90 days at CSC look like?") each show only an empty answer box with Save Answer, Skip, and Ignore. Per Batch D6, each role-expertise question should show Harper's suggested answer drafted from the Personal Profile (a DRAFT INTERVIEW_ANSWER ConsultationStatement with the composed answer, parts in groundingJson), which the seeker can edit and approve. No suggested answer appears for any of them.

## INVESTIGATE (report each with file and line)
1. Whether the role-expertise run generated suggested answers for these questions: where the DRAFT INTERVIEW_ANSWER statements are written, which turn they are attached to (the CONSULTANT question turn or a SEEKER turn), and whether they exist for this application. Check the D6 code path and the stored data shape without changing data.
2. How the Harper page finds and renders a question's interview answer (qa-view.ts, standing and thread components), and whether it only shows statements attached to a seeker reply turn, so a statement attached to the question turn is never displayed.
3. Whether the fill ran partially (the bounded regeneration keeping valid questions but dropping answers), and whether the parts validation rejected the suggested answers.
4. What the seeker should see and be able to do with a suggested answer today (edit, approve), per D6 and Batch A.

## FIX
Fix the root cause so each role-expertise question shows Harper's suggested answer, labeled "Interview answer" with its status (Draft), with the existing Edit and Approve controls, in its place under the question, and an answer box for the seeker to reply and refine as today. If the suggested answers were never generated because of a defect, fix the generation at the root; do not regenerate existing data automatically. Report whether existing applications will show their suggested answers after the fix, or need a new role-expertise run on the next seeker action.

## TESTS
Add automated tests that assert: a role-expertise question with a stored suggested answer renders that answer under the question, labeled "Interview answer" with its Draft status, with Edit and Approve; approving it marks it approved; replying refines it through the existing flow; and a question with no suggested answer still renders its question text and answer box. Run the worker boundary test (--conditions=react-server). Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

## COMMIT
After everything passes, commit on fix/role-expertise-suggested-answers with a message naming the role-expertise suggested answers fix, and push that branch. Do not merge into main or push main.

## REPORT
1. The investigation findings 1 to 4.
2. The root cause and the fix, with file and line.
3. Whether existing applications will show their suggested answers after the fix.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
6. The commit hash and branch pushed.
7. Confirmation that no git command discarded work and nothing outside this fix changed.

## Hints from related work
- Batch D6: role-expertise suggested answers as DRAFT INTERVIEW_ANSWER ConsultationStatement with parts in groundingJson.
- Likely files: src/lib/consultation/role-expertise.ts, qa-view.ts, ConsultationStanding.tsx, ConsultationThread.tsx, service.ts fill path, docs/prompts about harper-batch-d6.
- Production main is at 1623a52 (Harper usability). Branch from that main.
- Worker boundary: npx vitest run src/lib/research/research-worker-cli-boundary.test.ts
- Full suite: npx vitest run with NODE_ENV=test
- Also: npx tsc --noEmit, npm run lint, npm run build (production).
- On Windows PowerShell for commit messages use a here-string carefully; prefer git commit -m "message" style that works in PowerShell without bash HEREDOC if needed.

## Critical scope guards (from parent task)
- ONLY aiming-jobseek repo. Confirm remote is https://github.com/emaron01/aimed-jobseek.git before any change. Never touch Aimed Outreach or any other repo.
- Do NOT touch uncommitted B4 work on checkpoint/harper-prep-hub (DeleteMyAccountPanel, account page, UserMenu, etc.).
- Do NOT touch or modify the fix/harper-standing-structure branch or its worktree (C:\Repos\aimed-jobseek-harper-usability may be on that branch — do not use it for this work).
- Create a NEW branch from main named fix/role-expertise-suggested-answers. Main is currently expected at 1623a52 (in production).
- Prefer working in the primary checkout C:\Repos\aimed-jobseek ONLY if it is on a safe branch, OR create a fresh worktree from main for this branch so you never collide with B4 dirty files on checkpoint/harper-prep-hub. If the primary checkout is on checkpoint/harper-prep-hub with dirty B4 files, use `git worktree add` for a clean worktree on the new branch from origin/main. Never stash/discard B4 work.
- Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work.
- If anything unexpected happens, STOP and report.
- Surgical: fix ONLY missing role-expertise suggested answers. No features, no migrations, no schema, no Harper prompt changes. Production-grade root-cause fix only. Never silence type/lint errors.

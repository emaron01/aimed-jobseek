[BUILD + DEPLOY] Harper: Edit and Save keep your place on the page
Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.
PRODUCTION STANDARD
Reuse the existing mechanism that keeps the scroll position for replies and approvals on the Harper page. No schema changes. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/edit-keeps-place. If anything unexpected happens, STOP and report.
SURGICAL RULE
Fix only the defect below. Change nothing else.
DEFECT (production)
On the Harper page, clicking Edit on a draft and then Save moves the page to the top instead of keeping the seeker at that question. Find why the draft edit and save does not keep the position (unlike replies and approvals), with file and line, and fix it so Edit, Save, and any other control on a draft or question keep the seeker at that question on the Harper page, the Interview Cheat Sheet, and anywhere else the same card appears.
TESTS
Choose the minimum relevant tests that prove Edit and Save keep the position at the question, plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.
DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.
REPORT
The root cause and fix, with file and line, the checks run and results, and main before and after.

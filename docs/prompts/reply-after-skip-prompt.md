Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix the root cause. The seeker can always answer any question, including one they skipped; a failure is never silent and never loses their text. Every paid call stays behind the paid-call gate. No AI instruction changes, no migrations or schema changes unless reported and approved first, no data repair. Nothing runs on a page view or reruns on its own. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do NOT use C:/Repos/aimed-jobseek (it is on an old branch). Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1, or the fix/research-cleanup-2 or plan/approved-answers-as-profile branches or worktrees. Run git fetch, then create a new worktree and a new branch from origin/main named fix/reply-after-skip. If origin/main does not include 44da3c3 (the best-practice fix), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the two defects below. Do not merge into main or push main. Change nothing else. Add no features.

CONTEXT (production, application cmusnhmeu000vr52o68tvs6oy)
Harper's first round (lean split) asked six gap questions. Best-practice questions were never stored (the defect fixed in 44da3c3, which deployed after the steps below). The seeker answered one gap question and skipped the rest, before 44da3c3 deployed. After 44da3c3 deployed, the seeker opened the skipped question "You have recruited and led enterprise sales teams. How did you scale the team or its coverage model at Login VSI or OpenText to support separate new-logo and expansion motions, and what made that approach effective?" (turn cmutwhqpk000xt62ql88rwr90), entered a reply, and clicked Save twice. Both times the card showed "The reply could not be sent." The web log showed "Error: The destination stream closed early." The Best-practice section still says "Best-practice questions will appear here when Harper prepares them."

DEFECT 1: Replying to a skipped question fails
INVESTIGATE (file and line), with read-only SQL for the product owner to confirm the session and turn states in production:
1. The session's status and each gap turn's state after the skips (including whether skipping the last question closed or completed the session).
2. Reproduce locally: skip every gap question, then reply to a skipped one. Report the exact server-side error that preceded "The destination stream closed early", and why it happens.
FIX: the seeker can reply to any skipped question at any time, whatever the session's state, through the normal reply flow (extract and polish, behind the gate), and the reply is saved and processed. If something fails, the card shows the existing failure message and the typed text stays in the box. Report the fix.

DEFECT 2: An application with no stored best-practice questions never recovers once Harper's session is closed
INVESTIGATE (file and line): after the skips, does any normal seeker action still lead to the best-practice fill (maybeFillRoleExpertiseAfterGapPlan), given the session state? Report what the fill requires.
FIX: an application whose best-practice fill stored nothing recovers through the seeker's next Harper action (for example replying to any question, including a skipped one, or continuing Harper), even when the session is closed or complete: the fill runs once (reusing the stored questions receipt, so the questions call is not paid again), stores every chosen question, and shows them. It never runs on a page view, and never runs again once questions are stored. Report exactly which seeker actions trigger it.

TESTS
Replaced by the follow-up instruction: while working, run only the test files related to the changes. When the changes are complete, run the full suite once with the test database up and no other test process against it. If the full suite has failures, do not re-run the full suite; re-run only the failed files once. If they pass alone, treat them as flaky, note them, and continue. If they fail again, STOP. Then npx tsc --noEmit, the production build, and lint, once each. If everything passes, commit on fix/reply-after-skip and push the branch. Do not merge or push main.

COMMIT
After everything passes, commit on fix/reply-after-skip with a message naming replies to skipped questions and best-practice recovery after a closed session, and push that branch. Do not merge into main or push main.

REPORT
1. DEFECT 1: the session and turn states, the exact server error and why, the read-only SQL, and the fix, with file and line.
2. DEFECT 2: what the fill requires, the fix, and exactly which seeker actions trigger recovery.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
5. The commit hash, branch, and worktree path.
6. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these defects changed.

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only, per sections A, B, C, and F of docs/prompts/interview-stages-simplification-plan-report.md, with the product owner's decisions below overriding the plan where they differ. Copy lives in the product config. Reuse existing components and actions (AddContactForm and addApplicationContactAction, addCheatSheetInterviewNoteAction, the cheat-sheet collapsible heading treatment, AppButton); no new colors. No migrations or schema changes, no data repair, no deleting or clearing stored values, no AI prompt changes. Nothing the seeker wrote may disappear from view. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors. Low-risk change: deploy in this task only if every check passes.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Create a new worktree and a new branch from origin/main named fix/stages-batch-1. If origin/main does not include 5c1c5d6 (Cheat Sheet batch 3), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the items below, then deploy. Do not build Remove stage, the thank-you removal, the reminder change, the check-in change, or the rename (later batches). Format stays required (no schema change). Change nothing else. Add no features.

ITEM 1: Remove Open stage and the per-stage interviewer controls
1. Remove the "Open stage" link from the Interview stages list and from the Interview Cheat Sheet. Redirect /campaigns/{id}/interviews/{stageId} to the Interview stages list, so old links do not show the removed editors.
2. Remove the interviewer controls on existing stages ("Choose interviewer", "Use this interviewer", and "Add new interviewer"), and the stage-level "Post Interview Notes" button that scrolled to the old stage notes. Remove the create form's separate interviewer setup (InterviewStageSetupInterviewers), replaced by ITEM 3.

ITEM 2: Each stage organized by interviewer
Within each stage, each interviewer is a collapsible section using the cheat-sheet heading treatment and indicator, with the interviewer's name as the heading and the existing Harper link kept. Sections start collapsed, except: when a stage with no outcome has exactly one interviewer, that interviewer's section starts open. A stage with no interviewer shows exactly:
No interviewer was added to this stage.
and shows that stage's stored notes once on the stage (per ITEM 4), so they are not hidden.

ITEM 3: Create a stage starting with the interviewer
Creating a stage starts with exactly:
Start by choosing who you're meeting.
The seeker chooses an existing contact on the application, or creates one with the existing AddContactForm posting addApplicationContactAction (export the form without changing its fields). Then the stage form collects Type, Date and time, and Format (required, as today, with its current default). createInterviewStage requires that one contact and assigns it, without starting interviewer prep. "Notes before" and "Expected decision date" are no longer in the create form; new stages leave both stored columns empty.

ITEM 4: One Post Interview Notes section per interviewer
1. Inside each interviewer section, one notes block titled with the existing Post Interview Notes label. It shows, each labeled with its current field name: the stage's stored notesBefore, the stage's stored notesAfter, and this contact's cheat-sheet notes whose stageId is this stage. Stored stage notes are shown in each interviewer's section on that stage, not copied.
2. New notes append only through addCheatSheetInterviewNoteAction (as today, enqueueing a learnings reassess only when its fingerprint changed, on save, never on page view). The old before and after text areas are removed.
3. A stored expected decision date shows read-only, labeled exactly:
Expected decision date (saved earlier)
It is no longer editable. Stored notesBefore and expectedDecisionAt are never cleared.

TESTS
Add automated tests that actually render the pages and assert: Open stage is gone from the list and the Cheat Sheet, and the old stage URL redirects to the list; the per-stage interviewer controls, the stage-level Post Interview Notes button, and the create form's separate interviewer setup are gone; each stage lists its interviewers as collapsible sections, collapsed by default, with the single-interviewer unfinished stage open; a stage with no interviewer shows the exact line and its stored notes once; create starts with the exact line, uses the existing Add Contact path or an existing contact, then Type, Date and time, and required Format, and a stage without a contact is not created; stored notesBefore, notesAfter, and per-stage cheat-sheet notes all remain visible in Post Interview Notes; a new note appends to the cheat-sheet notes and reaches the learnings fingerprint and the Cheat Sheet's Notes From Interviews; a stored decision date shows read-only with the exact label; no stored value is cleared; rendering makes no paid call and enqueues no job. Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

DEPLOY (only if every check above passes with zero errors)
1. Commit on fix/stages-batch-1 with a message naming the simplified interview stages layout, create flow, and notes, and push the branch.
2. Run git fetch. Confirm origin/main is unchanged since this branch was created and the only commit in origin/main..fix/stages-batch-1 is this commit. Otherwise STOP and report; do not deploy.
3. Fast-forward origin/main to that commit by pushing it to main (fast-forward only; never force). If a fast-forward is not possible, STOP and report.
4. Confirm no migrations are in the range.
If any check fails, do not deploy: report the failure and leave the branch pushed.

REPORT
1. Each item: what changed, with file and line.
2. Every file changed.
3. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
4. The commit hash, branch, and worktree path; main before and after; confirmation the push was a fast-forward (or that nothing was deployed, and why).
5. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, no stored value was cleared, and nothing outside these items changed.
6. What the product owner should check in Render: the build succeeded, both services are running, the Interview stages page has no Open stage or per-stage interviewer controls, each stage lists collapsible interviewer sections with Post Interview Notes, and creating a stage starts by choosing who you're meeting.

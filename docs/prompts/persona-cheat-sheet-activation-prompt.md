Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only, per sections A, B, C, and E of docs/prompts/cheat-sheet-persona-sections-plan-report.md, with the product owner's decisions below overriding the plan where they differ. Copy lives in the product config. Use existing components, the existing collapsible heading treatment, and AppButton; no new colors. Every paid call goes through the existing paid-call gate with the free change check; writing stays on the writing model. One approved schema change (below); no other migrations, no data repair, no AI prompt changes. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Create a new worktree and a new branch from main named fix/persona-cheat-sheet-activation. If main does not include fix/personas-page-layout, STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the items below. Do not build the contact claim of a role section (plan section D), the Harper role block, ?person=persona:, or the role print anchor (later batches). Add no features.

APPROVED SCHEMA CHANGE
Add a nullable Persona.cheatSheetActivatedAt (DateTime?) in one migration. No default, no backfill; null means not on the Cheat Sheet.

PRODUCT OWNER DECISIONS
1. On each persona card on the Personas and Interviewers page, a button labeled exactly "Add to Cheat Sheet" (when not added) or "Remove from Cheat Sheet" (when added). Approve, Generate persona research, and "I know who is interviewing me in this group" stay as they are.
2. Add to Cheat Sheet, the first time for a persona (no stored role section yet): set cheatSheetActivatedAt, run the existing persona build only if hiringTeamSynthesizeUnchanged says it changed, then generate that persona's Cheat Sheet section once (APPLICATION_SUMMARY for persona:{personaId}, chained from the build worker when a build runs), through the paid-call gate on the writing model.
3. Remove from Cheat Sheet only hides it: clear cheatSheetActivatedAt. Nothing is deleted; the stored section and its question ids stay.
4. Add to Cheat Sheet again for a persona that already has a stored section: set cheatSheetActivatedAt and show that same stored section. Make no paid call and enqueue no job, even if its inputs changed since. Fresh questions come only from Refresh likely questions.
5. The Cheat Sheet shows the people the seeker has added plus the personas added to the Cheat Sheet. Personas not added do not appear there and have no generate control there.
6. A persona card on the Cheat Sheet (with no person attached) uses the same body, collapsible, print, and Refresh likely questions as a person section, with likely questions picked from Harper's General questions plus persona gap fill, and ends with exactly:
These are Harper's top picks for this role. They represent the types of questions someone in this role may ask. Make sure you study General Questions.
with "General Questions" linking to #general-questions.
7. A "Recommended" mark on Direct personas (involvement DIRECT) on the Personas page, with the line exactly:
Harper recommends studying these roles. They're the ones most likely to interview you for this job.
No confirmation when adding several roles. Nothing is added to the Cheat Sheet by default.
8. When the Cheat Sheet has no people and no personas added, show exactly:
When you know who you will interview with, add them here for Interview Prep.
with "add them here" opening Add Contact for that application (the Contacts page filtered to the application).
9. Adding a person (Harper Add Interview Contact, the interview stage Add new interviewer, Hiring Team Add person, and any other add path) no longer starts interviewer prep automatically: remove the automatic offerPersonPrep and its CONSULTATION person_prep enqueue from those paths. Prep starts only from the explicit Start interviewer prep control. Report every path changed.

TESTS
Add automated tests that actually render the pages (and drive jobs with mocked providers) and assert:
- The migration adds only the nullable column.
- A persona not added does not appear on the Cheat Sheet and has no generate control there.
- First Add to Cheat Sheet runs the build only when changed and one section write through the gate on the writing model; the persona then appears on the Cheat Sheet with the role note and link.
- Remove from Cheat Sheet hides it and keeps the stored section and question ids.
- Adding it back shows the same stored section with no paid call and no job, even after its inputs changed.
- The Recommended mark and line show on Direct personas only; nothing is added by default; no confirmation appears when adding several.
- The empty state shows the exact text, and "add them here" opens Add Contact for that application.
- Every add-person path no longer enqueues person_prep; Start interviewer prep still does.
- Rendering either page makes no paid call and enqueues no job.
Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/persona-cheat-sheet-activation with a message naming Add to Cheat Sheet for personas, recommended roles, the empty state, and no automatic interviewer prep on add, and push that branch. Do not merge into main or push main.

REPORT
1. The migration SQL.
2. Each decision: what changed, with file and line, including every paid call each action can make and when it is skipped.
3. Every add-person path changed for decision 9.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
6. The commit hash, branch, and worktree path.
7. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these items changed.

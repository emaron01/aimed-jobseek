Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Copy lives in the product config. Reuse existing components (CheatSheetSection and the cheat-sheet collapsible and print behavior, AppButton); no new colors. No migrations or schema changes, no data repair, no AI prompt changes. Notes are always saved and never deleted by this change. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Create a new worktree and a new branch from origin/main named fix/notes-no-reassess-and-section. If origin/main does not include the tip of fix/interview-notes-polish (the Interview Notes page polish), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the five items below. Do not merge into main or push main. Do not build the thank-you removal, reminder change, or check-in change (later batch). Change nothing else. Add no features.

ITEM 1: Saving notes never triggers Harper
1. Report, with file and line, every place a notes save or interview removal enqueues a Harper learnings reassess or any other paid job (for example enqueueLearningsReassessIfChanged after an interview note, a Cheat Sheet interview note, the job page's learned notes, stage notes, removing an interview, and any other notes path), and anything else those saves enqueue (for example an APPLICATION_SUMMARY shell job), with the model each would use.
2. Remove the automatic learnings reassess from every one of those paths. Saving notes saves them and does nothing else paid. Notes remain available to Harper as context whenever Harper runs for any other reason.
3. Report (do not change) any other paid job a notes save still enqueues, with its trigger and model, for the product owner to decide.

ITEM 2: Interview Notes section on the Cheat Sheet
Add one section to the Interview Cheat Sheet, titled exactly "Interview Notes", using the same collapsible section and print behavior as General Questions, starting collapsed, placed directly after General Questions, opened by #interview-notes, and visible when a person filter is selected. It lists every interview note for the application from every person (the cheat-sheet notes and any stored stage notes, each shown once), sorted by date, newest first. Each entry shows the date and time, the person's name, the interview (type and date) when known, and the note text. Notes also stay in each person's own section as today. It prints like the other sections, as plain text.

ITEM 3: Remove interviewer sections from the Harper page
Remove the interviewer (person) sections, person view, person search, and Add Interview Contact from the Harper page, so Harper shows only Where you stand, the questions that need more information, and the best-practice questions. Interviewer prep stays on the Interview Cheat Sheet. Report every link that pointed to Harper's person view (for example #harper-contact:{id} or ?person=) and point each to that person's Cheat Sheet section instead. No stored data changes.

ITEM 4: Outcome wording
On the Interview Notes page, label the line showing the saved outcome exactly "Saved outcome", and change the confirmation shown after saving an outcome to exactly "Outcome saved."

ITEM 5: One notes label
On the Interview Notes page, replace the "Post Interview Notes" heading and the "Newly gained information" label with a single label, exactly "Interview Notes". The saved notes list, the text box, and the "Save and Add Note to Cheat Sheet" button are otherwise unchanged.

TESTS
Add automated tests that actually render the pages (and drive actions against real Postgres where saving is involved) and assert:
- ITEM 1: saving an interview note, a Cheat Sheet interview note, the job page's learned notes, and removing an interview enqueue no learnings reassess and make no paid call; the notes are saved and still appear everywhere they appear today.
- ITEM 2: the Cheat Sheet shows an "Interview Notes" section after General Questions, collapsed, opened by #interview-notes, visible with a person filter; it lists every note once, newest first, with date and time, person, interview, and text; notes still show in each person's section; print shows the section as plain text.
- ITEM 3: the Harper page no longer shows interviewer sections, person view, person search, or Add Interview Contact; Where you stand and both question sections still show; links that pointed to Harper's person view now go to that person's Cheat Sheet section.
- ITEM 4 and ITEM 5: the exact "Saved outcome", "Outcome saved.", and "Interview Notes" labels, with behavior unchanged.
- Rendering makes no paid call and enqueues no job.
Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/notes-no-reassess-and-section with a message naming no Harper reassess on notes, the Interview Notes section, Harper without interviewer sections, and the outcome and notes labels, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1: every path found, what was removed, and any other paid job a notes save still enqueues, with file and line.
2. ITEM 2: the section, with file and line, and how each note is shown once.
3. ITEM 3: what was removed from Harper, and every link repointed, with file and line.
4. ITEMS 4 and 5: the changes, with file and line.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
7. The commit hash, branch, and worktree path.
8. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these items changed.

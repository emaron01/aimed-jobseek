Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Copy lives in the product config. Use existing components and actions (AddContactForm and addApplicationContactAction, the interview create action, addCheatSheetInterviewNoteAction, the outcome save, the cheat-sheet collapsible heading treatment, AppButton); no new colors. No migrations or schema changes, no data repair, no AI prompt changes. Behavior of every action is unchanged apart from labels, layout, and showing saved notes. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors. Low-risk change: deploy in this task only if every check passes.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1, the untracked files in C:/Repos/aimed-jobseek, or any fix/notes-page-polish branch or worktree. Create a new worktree and a new branch from origin/main named fix/interview-notes-polish. If origin/main does not include b8c50b6 (interview page organized by person), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the five items below, then deploy. Do not build the thank-you removal, reminder change, or check-in change (later batch). Change nothing else. Add no features.

ITEM 1: Collapsible add flow
1. The "Add someone you're meeting" area becomes a collapsible section using the cheat-sheet heading treatment, starting collapsed, titled exactly "Add someone you're meeting".
2. Inside it, in this order: the "Interviewer" chooser for an existing contact ("Choose who you are meeting."); then a nested collapsible titled exactly "Add a new contact", starting collapsed, holding the existing AddContactForm (fields unchanged), which after saving makes the new contact selectable in the Interviewer chooser; then Type, Format, and Date and time; then the submit button, renamed from "Add stage" to exactly "Add interview". Behavior unchanged.
3. After an interview is added, the section collapses again and the new interview appears under its person.

ITEM 2: Outcome
Rename the outcome save button "Save stage" to exactly "Save outcome", and add standard spacing between the Outcome dropdown and that button so they do not touch. Behavior unchanged.

ITEM 3: Post Interview Notes
1. Rename the button "Add to cheat sheet" to exactly "Save and Add Note to Cheat Sheet". It still saves through addCheatSheetInterviewNoteAction, as today.
2. Directly above the note text box, list every saved note for this person and this interview, oldest first, each showing its saved date and time (from the note's createdAt) and its text. Stored notesBefore and notesAfter keep showing as today, labeled. After saving, the new note appears in that list with its date, and the text box clears.

ITEM 4: Add Follow-up Interview
Replace the "Add another interview" control inside each person's section with a collapsible section using the cheat-sheet heading treatment, starting collapsed, titled exactly "Add Follow-up Interview", holding Type, Format, and Date and time and a submit button labeled exactly "Add follow-up interview". It creates a new interview for this same person through the same create path with the contact preset, as today. After adding, the section collapses and the new interview appears under this person.

ITEM 5: Rename to Interview Notes
Rename the left navigation step "Interview stages" to exactly "Interview Notes", and this page's heading "Interview stages" to exactly "Interview Notes". Keep the page's description line, the Cheat Sheet's Interview stages section, the tracker chip, reminder text, and Send Outreach labels unchanged, and report each with file and line. Also report (do not change) every other seeker-facing use of the word "stage" on this page and on the Cheat Sheet's interview section, with file and line.

TESTS
Add automated tests that actually render the page and assert: "Add someone you're meeting" starts collapsed and opens on click, with the Interviewer chooser first, "Add a new contact" nested and collapsed, then Type, Format, and Date and time, and the button "Add interview"; adding a new contact makes it selectable; adding an interview creates it under its person and collapses the section; the outcome button reads "Save outcome" with spacing from the dropdown and saves as before; the note button reads "Save and Add Note to Cheat Sheet", saved notes for this person and interview show above the text box oldest first with their date and time, and a new note appears there after saving with the box cleared; stored notesBefore and notesAfter still show; "Add Follow-up Interview" starts collapsed, its button reads "Add follow-up interview", and it creates a new interview for the same person; the left navigation step and the page heading read exactly "Interview Notes"; the excluded labels are unchanged; rendering makes no paid call and enqueues no job. Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

DEPLOY (only if every check above passes with zero errors)
1. Commit on fix/interview-notes-polish with a message naming the collapsible add flow, Save outcome, saved notes with dates, Add Follow-up Interview, and the Interview Notes rename, and push the branch.
2. Run git fetch. Confirm origin/main is unchanged since this branch was created and the only commit in origin/main..fix/interview-notes-polish is this commit. Otherwise STOP and report; do not deploy.
3. Fast-forward origin/main to that commit by pushing it to main (fast-forward only; never force). If a fast-forward is not possible, STOP and report.
4. Confirm no migrations are in the range.
If any check fails, do not deploy: report the failure and leave the branch pushed.

REPORT
1. Each item: what changed, with file and line; the unchanged labels and remaining "stage" wording, each with file and line.
2. Every file changed.
3. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
4. The commit hash, branch, and worktree path; main before and after; confirmation the push was a fast-forward (or that nothing was deployed, and why).
5. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these items changed.
6. What the product owner should check in Render: the build succeeded, both services are running, the left navigation and page heading read Interview Notes, Add someone you're meeting is collapsed with Add a new contact inside it, saved notes show above the note box with dates, and Add Follow-up Interview is a collapsed section.

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Copy lives in the product config. Reuse existing components and actions (the Stages batch 1 create flow with AddContactForm and addApplicationContactAction, addCheatSheetInterviewNoteAction, the outcome save, the cheat-sheet collapsible heading treatment, AppButton); no new colors. No migrations or schema changes, no data repair scripts. Deleting removes only what the seeker chooses (and what cascades from it per the schema); never delete contacts, person cheat-sheet notes, Harper turns, prep, or messages. Nothing the seeker wrote disappears from view except by their explicit choice. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Create a new worktree and a new branch from origin/main named fix/notes-by-person. If origin/main does not include dc860df (Stages batch 1), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the items below on the Interview stages page. Do not build the thank-you removal, reminder change, check-in change, or the rename to Notes (later batches). Do not merge into main or push main. Change nothing else. Add no features.

PRODUCT OWNER DECISION
The person is the unit: everything about the interviews with a person is kept under that person. Several people can share a persona; two people on separate calls are two separate people with separate interviews and notes. Nothing about one person ever replaces another.

ITEM 1: Organize the page by person
1. At the top, the existing create flow from Stages batch 1, titled exactly:
Add someone you're meeting
(choose an existing contact or Add Contact, then Type, Date and time, and required Format). It creates one interview (stage) for that person.
2. Below it, one collapsible section per person who has at least one interview, using the cheat-sheet heading treatment, with the person's name as the heading and the existing Harper link. People are ordered by their most recent interview date, newest first. Sections start collapsed, except a person whose only interview has no outcome starts open.
3. Inside each person's section, each of their interviews (newest first) shows its Type, Date and time, Format, and its Outcome with the existing save, its Post Interview Notes (the stage's stored notesBefore and notesAfter and this person's cheat-sheet notes for that stage, each labeled as in Stages batch 1, with new notes appended through addCheatSheetInterviewNoteAction), any read-only "Expected decision date (saved earlier)", and a "Remove" control (ITEM 2).
4. Inside each person's section, an "Add another interview" control creates a new interview for this same person (Type, Date and time, required Format), through the same create path with the contact preset.
5. Interviews with no person attached appear in a group at the end titled exactly:
Not linked to anyone
each showing its stored notes, read-only decision date, Outcome, and Remove.
6. Remove the old per-stage layout (stage cards with interviewer sections inside them) so each interview appears once, under its person.
7. A person on an older stage that has several people appears under each of those people, and that stage's stored notes show under each, without being copied.

ITEM 2: Remove an interview
1. Remove always asks for confirmation:
   - When the interview has no stored notesBefore, no stored notesAfter, and no cheat-sheet note with its stageId, show exactly:
Remove this interview? This can't be undone.
   - When any of those notes exist, show exactly:
Remove this interview? Notes saved on this interview will be deleted. Notes saved for this person and any messages you created stay.
   Cancel changes nothing.
2. On confirm, a server action checks that the seeker owns the interview's application. If the interview has only this person (or no person), it deletes the InterviewStage row and lets the schema cascade its interviewer rows and guide; report everything that cascades or is set null (for example ApplicationAsset.interviewStageId set null, so existing messages stay). If the interview has other people too (an older stage), it removes only this person's link to it, and the interview stays for the others.
3. It never deletes contacts, person cheat-sheet notes (entries whose stageId pointed at a deleted interview must still display on the Cheat Sheet's Notes From Interviews and anywhere else they display today; report how), Harper turns, prep, or messages. It does not renumber sortOrder and does not change application progress.
4. After a deletion, call enqueueLearningsReassessIfChanged only when the learnings fingerprint changed. Reminders for a deleted interview disappear because they are computed. The sidebar step stays green only while at least one interview exists.

TESTS
Add automated tests that actually render the page and drive actions against real Postgres, and assert:
- ITEM 1: the create flow is titled exactly "Add someone you're meeting"; each person with interviews has one collapsible section with their interviews newest first, each showing type, date, format, outcome with save, Post Interview Notes, and Remove; two people sharing a persona appear as two separate sections and nothing of one replaces the other; Add another interview creates a new interview for that same person; interviews with no person appear under "Not linked to anyone"; a person on an older multi-person stage appears under each person with the stage notes shown, not copied; each interview appears once under its person; stored notes all remain visible.
- ITEM 2: the confirmation text is exact for an interview without notes and with notes; Cancel changes nothing; confirm deletes a single-person or unlinked interview with its cascades; on an older multi-person stage it removes only that person's link and the interview stays for the others; contacts, person cheat-sheet notes (including ones pointing at a deleted interview, which still display), Harper turns, prep, and messages remain; other interviews and their order are unchanged; application progress is unchanged; a learnings reassess is enqueued only when the fingerprint changed; reminders for a deleted interview no longer appear; the sidebar step is green only while an interview exists; a seeker cannot remove another organization's interview.
- Rendering makes no paid call and enqueues no job.
Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/notes-by-person with a message naming the interview page organized by person and Remove interview, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1: the new structure, with file and line, and what was removed.
2. ITEM 2: the control, confirmation, and server action, with file and line; everything that cascades, is set null, or remains; the multi-person unlink behavior; and how person notes pointing at a deleted interview still display.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
5. The commit hash, branch, and worktree path.
6. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these items changed.

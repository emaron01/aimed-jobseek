# UI batch 1

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Use the app's existing components, buttons (AppButton), and design tokens (the existing success green: text-success, bg-success-tint, border-success; and the existing primary blue); no new colors. No temporary fixes, no data repair, no migrations or schema changes unless reported and approved first, no prompt changes. Nothing on any page may make a paid call or enqueue a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub or any other in-progress branch. Work on the existing branch fix/ui-batch-1 in its existing worktree C:\Repos\aimed-jobseek-ui-batch-1; do not create another branch or worktree. Confirm fix/flaky-tests is merged into main and fix/ui-batch-1 contains main; if not, STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the six items below. Change nothing else. Add no features. Keep all existing behavior on each page.

ITEM 1: Harper approved status and collapse all
- Everywhere Harper shows an approved answer (including the collapsed approved badge in ConsultationThread.tsx, today text-ink on bg-canvas, and the expanded statement header "{kind} · Approved"), render "Approved" larger than today and in the existing success green, as a clear status badge (not grey text).
- Add one control at the top of the Harper page, in ConsultationStanding next to the existing evidence toggle-all pattern, that toggles between "Collapse all approved" and "Expand all approved", collapsing or expanding every approved answer on the page at once. Lift the collapse state so this control and each approved card's own expand and collapse work together. The control does not affect open questions or drafts.

ITEM 2: Cheat Sheet components collapsible
- Make every component of the Interview Cheat Sheet collapsible by clicking its heading: At a glance, each person or persona section, Company, Position, Interview stages, and within each person section the subsections (Notes From Interviews With {Name}, What they care about, How to position yourself, Key statements, Likely questions, Questions to ask them, Additional Interview Prep Q&A). Nothing is removed; all content stays available for study.
- All components start collapsed, showing their headings. Each heading uses the same treatment as the Harper sections (HarperPageSection: darker blue, arrow pointing right when collapsed and down when open, aria-expanded).
- Any link or anchor to content inside a collapsed component (including #overview, #company, #position, #stages, #contact:{id}, #contact:{id}-likely-questions, and the ?person= preselection scroll) opens that component and scrolls to the content.
- Printing still prints the full content of the printed section, expanded.

ITEM 3: Personas grouped and color-coded
- On the Personas and hiring team page, group personas into two collapsible groups titled exactly "Approved" and "Needs review", both starting open, each using the same heading treatment as ITEM 2.
- An approved persona's details dropdown box uses the existing success green; a persona that needs review uses the existing primary blue. Report exactly which state counts as approved versus needs review today.

ITEM 4: Outreach "Did you send this?"
- Report, with file and line, how a sent message is recorded today (model, status, and what "Sent messages appear under each name" reads).
- After the seeker opens a message in their email client (any email option) or copies the LinkedIn text, show a prompt with exactly: Did you send this message?
  with two buttons, exactly: Yes, mark as sent and Not yet
- Yes, mark as sent records the message as sent with today's date through the existing sent-recording path, so it appears under the person's name as sent. Not yet records nothing and closes the prompt; the prompt appears again the next time the seeker opens or copies that message.
- Nothing is sent from the product. If recording a sent message requires a schema change, STOP on this item and report.

ITEM 5: Stage: add interviewers while setting up the interview
- On the interview stage setup, let the seeker add one or more interviewers in the same step as creating or scheduling the interview, using the existing interviewer selection and add-contact controls, before the first save. Adding interviewers here is optional.
- Adding interviewers after saving still works as today. Adding an interviewer here assigns them only; interviewer prep starts only through the existing "Start interviewer prep" control, as today.

ITEM 6: Harper collapsed approved rows show the question
- A collapsed approved answer on Harper (QuestionCard collapsed UI) shows the question text as its one-line label, not the start of the answer, followed by the Approved badge and the link to show the approved answer.

TESTS
Add automated tests that assert:
- ITEM 1: "Approved" renders as a larger success-green badge in the collapsed and expanded states; "Collapse all approved" collapses every approved answer and "Expand all approved" expands them; open questions and drafts are unaffected; individual collapse still works after using the control.
- ITEM 2: every Cheat Sheet component and person subsection is collapsible, all start collapsed with the shared heading treatment, an anchor or ?person= link into a collapsed component opens it and scrolls to it, and printing includes full content.
- ITEM 3: personas are grouped under "Approved" and "Needs review", both start open, and detail boxes use green and blue respectively.
- ITEM 4: opening an email option or copying LinkedIn text shows the exact prompt and buttons; Yes records the message as sent with the date and shows it under the person; Not yet records nothing and the prompt returns next time; nothing is sent from the product.
- ITEM 5: interviewers can be added during stage creation before the first save; adding after saving still works; assignment does not start prep.
- ITEM 6: a collapsed approved answer shows its question text, the Approved badge, and the show link, and not the start of the answer.
- No page render or status check makes a paid call or enqueues a job.
Run the worker boundary test (--conditions=react-server). Run npm test (default parallelism, including real-Postgres tests), plus the exact production build, the full type check, and lint. All must pass with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/ui-batch-1 with a message naming UI batch 1, and push that branch. Do not merge into main or push main.

REPORT
1. Each item: what changed, with file and line.
2. ITEM 3: the approved versus needs-review rule.
3. ITEM 4: how sending is recorded today and how Yes records it.
4. Any item stopped, and why.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside these six items changed.

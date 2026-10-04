Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root. Copy lives in the product config. Use existing components and AppButton; no new colors. Hide, do not delete, the HTML signature (no removal of its code or stored data). Editing a message makes no paid call. No migrations or schema changes unless reported and approved first: if editable messages need one, STOP and report it before changing anything. No data repair, no AI prompt changes. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors. Deploy in this task only if every check passes.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do NOT use C:/Repos/aimed-jobseek (it is on an old branch). Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1. Run git fetch, then create a new worktree and a new branch from origin/main named fix/signature-and-editable-outreach. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the four items below, then deploy. Change nothing else. Add no features.

ITEM A: Hide the HTML signature
Report, with file and line, every place a seeker can enter, view, or use an HTML signature. Hide every seeker-facing HTML signature input and option (Outlook desktop and web do not support it through this handoff). A stored HTML signature is never used in any message. The plain-text signature block stays.

ITEM B: The signature block must be the one used
DEFECT: generated emails use a signature from somewhere other than the signature block the seeker entered in setup.
1. Report, with file and line, exactly where the signature in a generated or handed-off email comes from today (for example the stored HTML signature, the profile name or contact details, an organization default, or text the model writes), for every email path: generation, the stored message, Open in Outlook web, Open in Outlook desktop, Open in Gmail, and Copy.
2. Fix at the root: when the seeker has saved a signature in the signature block, every email uses exactly that text, once, at the end, in every path above. When none is saved, no signature is added (no default and no model-written sign-off block). The model never writes its own signature block. LinkedIn messages and InMail get no email signature. Report whether existing stored messages already contain a wrong signature and how they display now (no data repair).

ITEM C: Signature panel guidance
In the signature panel, directly above the signature block, show these as two separate lines, exactly:
Outlook users — Outlook adds your signature automatically if you have one set there. You do not need to enter one below.
Gmail users — Gmail does not add your signature automatically. Save one below, or add it in the Gmail window after clicking Open in Gmail on each message.

ITEM D: Editable outreach messages
Every Harper-generated outbound message on Send Outreach (emails, LinkedIn connection notes, LinkedIn messages and InMail, follow-ups, check-ins, existing thank-you messages, and any other generated message) is editable directly in its message window: the seeker edits the subject (for email) and body in place and saves. The saved edit is the message's text everywhere afterward: on screen, in Open in Outlook web and desktop, Open in Gmail, LinkedIn copy, Copy, and Mark as sent. Paragraph spacing is kept. Editing makes no paid call and enqueues nothing. Regenerating a message after an edit must not silently discard the edit: report how it behaves today and make it keep the edited text unless the seeker explicitly regenerates (report the exact behavior). Report where edits are stored, with file and line.

TESTS
Add automated tests that actually render the pages and drive actions against real Postgres, and assert: no HTML signature input or option renders, and a stored HTML signature is never used; with a saved signature block, every email path (generation, stored message, Outlook web, Outlook desktop, Gmail, Copy) ends with exactly that signature once; with none saved, no signature or model-written sign-off block is added; LinkedIn messages get no email signature; the two guidance lines render exactly, separately, above the signature block; every generated message type on Send Outreach can be edited in place and saved; the saved edit is used on screen and in every handoff, with paragraph spacing kept; editing makes no paid call and enqueues nothing; regenerate behaves as reported; rendering makes no paid call and enqueues no job. Run npm test (default parallelism, including real-Postgres tests; database up, not in parallel with the build), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

DEPLOY (only if every check above passes with zero errors and no schema change was needed)
1. Commit on fix/signature-and-editable-outreach with a message naming the hidden HTML signature, the signature block fix, the signature guidance, and editable outreach messages, and push the branch.
2. Run git fetch. Confirm origin/main is unchanged since this branch was created and the only commit in origin/main..fix/signature-and-editable-outreach is this commit. Otherwise STOP and report; do not deploy.
3. Fast-forward origin/main to that commit by pushing it to main (fast-forward only; never force). If a fast-forward is not possible, STOP and report.
4. Confirm no migrations are in the range.
If any check fails, do not deploy: report the failure and leave the branch pushed.

REPORT
1. Each item: what changed, with file and line, including where the wrong signature came from, every email path fixed, where edits are stored, and the regenerate behavior.
2. Every file changed.
3. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
4. The commit hash, branch, and worktree path; main before and after; confirmation the push was a fast-forward (or that nothing was deployed, and why).
5. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these items changed.
6. What the product owner should check in Render: the build succeeded, both services are running, the signature panel shows the two lines and no HTML option, a saved signature appears once at the end of a generated email in Outlook and Gmail, and an outreach message can be edited in its window and the edit is what opens in Outlook or Gmail.

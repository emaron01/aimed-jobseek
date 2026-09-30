Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no schema changes, no Harper prompt changes. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Uncommitted B4 work exists on checkpoint/harper-prep-hub: do not modify, stash, or discard it. Do this work on a new branch from main (after the Harper usability fixes are on main) named fix/harper-standing-structure. If anything unexpected happens, STOP and report.
SURGICAL RULE
Implement only the four items below, per Part B of the Harper page usability report (docs/prompts/harper-page-usability-fixes-prompt.md and its report). Do not change Harper's prompts, planning, paid calls, the person view, Stage, Outreach, or the Cheat Sheet beyond what these items require. Add no features.
ITEM 1: Replies always attach to the question the seeker answered
Root cause (from the report): recordConsultationReply stores replyToTurnId as the follow-up turn id when a follow-up is open; processConsultationReply resolves the primary question by that id, fails, and resolveReplyableQaItem falls back to the first replyable item sharing the targetKey (replyable[0]); the new coaching or follow-up is then pinned to that wrong question.
- Fix at the root: always resolve the primary question through the reply chain (primaryFor over the asked consultant turns), never by falling back to the first item sharing a targetKey when the seeker's reply already records which turn it answered. Write coaching, follow-ups, and results with that primary question's id only.
- A reply's draft answer, coaching, and follow-up always appear under the question the seeker answered.
ITEM 2: One Where you stand, each item once
Replace the three separate surfaces (the top gap list from buildStandingGaps, the "Expand all" topic list, and the requirement list) with one Where you stand list, keyed by requirement or topic:
- The summary (for example "Strong 9, Partial 5, None 1") stays at the top.
- Each requirement or topic appears exactly once, in this order within it:
  a. The requirement or topic text with its rating (Strong, Partial, or None) as the only status. No separate Open, Closed, or Confirmed label.
  b. Harper's reason and "Expand evidence", as today.
  c. Harper's question(s) for it, including follow-ups, each once.
  d. The seeker's reply, labeled "Your reply", collapsed by default behind "Show your replies" and always kept.
  e. Harper's result, labeled "Interview answer" and "Resume bullet", each with its status and the existing Approve and Edit controls.
  f. The answer form ("Save Answer", Skip, Ignore) where a question is open, in one row, as fixed today.
- Topics that are not requirements (why you want to work at this company, the career walk-through, role-expertise questions, and overview gaps) follow the same structure, each once.
- Keep the Batch A to C behaviors (Ignore and Ignored, needs-more-detail message, anchors #harper-standing and #harper-q:{questionTurnId}, reply waits for Harper, drafts kept, no scroll jump).
- The render invariant still holds: every item with seeker content or an open question renders exactly once on the page.
ITEM 3: Merge near-duplicate requirements
When a Required item and a scorecard competency (or outcome) describe the same requirement (use the existing sameRequirementMeaning), show one entry using the Required wording, with its questions, replies, and results merged under it. Report how the entry's rating is chosen when the two assessments differ, and never drop any seeker content from either.
ITEM 4: Remove Pause, Done, and Skip the rest
- Remove the three buttons from the Harper page.
- Before removing, report with file and line whether anything depends on the consultation reaching DONE or SKIPPED (for example resume or cover letter generation, sidebar step color, or any gate). If anything would be blocked or broken by never reaching those states, STOP on this item and report it for the product owner; do not remove the buttons until approved.
- Resume and cover letter generation must not be started as a side effect of anything on the Harper page.
- Existing sessions in PAUSED state (test data) must not block reply processing; report how they are handled, with no data repair.
TESTS
Add automated tests that assert:
- With a follow-up open on one question and another question sharing its targetKey, a reply's draft, coaching, and follow-up attach to the question answered, never the other; a reproduction of the reported case (reply to the front-line management requirement; follow-up appeared under "If we spoke with your recent leaders and peers...") now attaches correctly.
- Where you stand renders each requirement and topic once, with one rating and no Open, Closed, or Confirmed label, in the a to f order; "Why you want to work at this company" renders once.
- A Required item and its near-copy competency render as one entry with the Required wording and all content from both.
- "Your reply" is collapsed by default and kept; "Interview answer" and "Resume bullet" are labeled with their statuses and Approve and Edit.
- Pause, Done, and Skip the rest no longer render, and nothing on the Harper page starts resume or cover letter generation.
- The render invariant holds, and rendering makes no paid call and enqueues no job.
Run the worker boundary test (--conditions=react-server). Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.
COMMIT
After everything passes, commit on fix/harper-standing-structure with a message naming the Harper Where you stand structure and reply attachment fixes, and push that branch. Do not merge into main or push main.
REPORT
1. ITEM 1: the fix, with file and line.
2. ITEM 2: the new structure, with file and line, and what was removed.
3. ITEM 3: the merge rule and how the rating is chosen.
4. ITEM 4: the dependency findings, and what was removed (or the STOP).
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside these items changed.

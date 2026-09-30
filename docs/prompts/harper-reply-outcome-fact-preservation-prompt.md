Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no schema changes. The only prompt text change allowed is the approved sentence in ITEM 2. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub. Work on fix/harper-answer-refresh (currently c7e2c17, not yet merged into main), committing on top of it. If it has uncommitted work in progress, STOP and report. If anything unexpected happens, STOP and report.
SURGICAL RULE
Fix only the three items below. Change nothing else. Add no features.
ITEM 1: Every reply must end in a visible outcome
DEFECT: In production, the seeker replied to the question "In one of your recent North American sales leadership roles, how did you divide ownership between winning new enterprise customers and expanding existing accounts, and what revenue result did that approach produce?" The reply is stored and shown as "Your reply", but no Interview answer or Resume bullet draft, no follow-up question, and no "Add a bit more detail so Harper can shape this answer." message appears, even after refreshing and waiting. A second reply submitted around the same time produced a draft normally. The reply began: "The GTM I developed at OpenText was split into two - GSI and end customers..." and ended "...this splits to about 60/40."
RULE: every processed reply ends in exactly one visible outcome under the question answered: a draft to approve, a follow-up question, or the needs-more-detail message. It never ends in nothing.
INVESTIGATE (file and line): trace this reply through record, drain, extract, polish or follow-up, the quality checks, supersede, and display. State exactly where it stopped: never processed (queue or serialization), extract classified it with no result and no follow-up, a result or follow-up was written but attached elsewhere or filtered from display, the item's section logic hid it, or something else. Check whether the other reply being processed at the same time affected it.
FIX at the root so the rule above always holds, for every question kind and section. If the stored data shows a draft or follow-up that exists but is not displayed, fix the display; if processing produced nothing, fix processing so it always produces one of the three outcomes.
ITEM 2: Harper keeps facts exactly as stated
DEFECT: Harper's draft changed the seeker's stated fact "3 of my 4 reps" into "three or four sellers" in both the Interview answer and the Resume bullet.
Add exactly this sentence to the instructions of every Harper step that restates the seeker's facts: the polish instructions (interview answer and resume bullet), the extract instructions, the role-expertise suggested-answer instructions, and the Cheat Sheet person guidance sample-answer instructions:
Keep every number, fraction, percentage, date, company, and name exactly as the person stated it.
Change no other wording. Bump each affected prompt version per convention and report what each bump triggers. Nothing regenerates automatically or on a page view.
ITEM 3: A new draft after an approved answer must be visible
c7e2c17 made latestOfKind prefer an APPROVED statement over any later DRAFT (qa-view.ts about 130-137). When the seeker saves a new answer to a question that already has an approved answer, Harper's new DRAFT is created but hidden.
- Show the APPROVED answer as the current answer, and when a newer DRAFT exists for the same question and kind, show that draft beneath it, labeled as a new draft with Approve and Edit.
- Approving the new draft makes it the approved answer and retires the previous approved one (it no longer shows as current). Report exactly what happens to the previous approved statement (kept as history or replaced) and confirm nothing downstream (resume, cover letter, outreach, cheat sheet) uses two approved answers for the same question at once.
- An approved answer is never replaced without the seeker approving the new draft.
TESTS
Add automated tests that assert:
- Using the reported reply as a fixture, processing produces exactly one visible outcome under that question (a draft, a follow-up, or the needs-more-detail message), and two replies processed close together each produce their own outcome.
- For each outcome type, the outcome renders under the question answered and nowhere else.
- Each affected prompt contains the exact new sentence.
- A question with an approved answer and a newer draft shows both (approved as current, new draft beneath with Approve and Edit); approving the new draft makes it the only current approved answer; the old approved answer is never replaced without that approval; downstream consumers see exactly one approved answer per question and kind.
- Rendering makes no paid call and enqueues no job.
Run the worker boundary test (--conditions=react-server). Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors. If a test fails only under full-suite load and passes alone, report it by name as a flake; do not change it to pass. Never change an existing test only to make it pass; report any test changed and why.
COMMIT
After everything passes, commit on fix/harper-answer-refresh with a message naming the reply outcome, fact preservation, and approved-plus-draft fixes, and push that branch. Do not merge into main or push main.
REPORT
1. ITEM 1 investigation: exactly where this reply stopped, with file and line.
2. ITEM 1 fix, with file and line.
3. ITEM 2: every prompt changed (before and after), and version bumps with what each triggers.
4. ITEM 3: the display change, what happens to the previous approved statement, and the downstream check.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; flakes by name; the worker boundary test result; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside these three items changed.

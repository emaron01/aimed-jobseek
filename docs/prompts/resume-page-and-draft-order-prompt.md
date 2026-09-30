Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no schema changes. The only prompt text change allowed is the approved text in ITEM 5; any other prompt change must be reported and approved first. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub. Create a new branch from main named fix/resume-page-and-draft-order. If main does not yet include fix/harper-answer-refresh (332bfa4), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the five items below. Change nothing else. Add no features.

ITEM 1: Resume and cover letter page stays spinning after generation completes
DEFECT: The seeker clicked Generate for the resume and the cover letter. The page kept showing its generating state for more than 10 minutes. The worker log shows both jobs completed successfully (RESUME job cmunixgs40015ly2oq0ldgoqg, durationMs=29013, succeeded; COVER_LETTER job cmunixxyc0017ly2olmc83qlq, durationMs=26878, succeeded, cover_letter_validation passed). After a full page refresh, both appeared. So the jobs finish, but the page never learns they finished.
INVESTIGATE (file and line): how the page decides it is generating and how it learns a job finished (polling, refresh, or server render); why it never re-checks or never sees completion (for example polling that stops, watches a different job id or key after serialization, or reads a status that is not updated). FIX at the root so the page shows the finished resume and cover letter as soon as their jobs complete, never shows generating when no job for them is running, and shows a failure (not a spinner) if a job fails.

ITEM 2: A regenerate instruction was not applied
DEFECT: The seeker asked to regenerate the resume with the instruction to change the section heading "Earlier Sales Leadership Experience" to "Earlier Sales and Leadership Experience". After a full refresh, the heading was unchanged.
INVESTIGATE (file and line): where that section heading comes from (fixed text in code or template, or written by the model); whether the regenerate instruction reached the generation call (payload and fingerprint); whether the request was skipped by the paid-call gate as unchanged; whether a new resume version was created; and whether the model ignored it. State the exact cause.
FIX at the root: a regenerate instruction is always part of the generation input and fingerprint, so a new instruction always runs the generation; if the heading is fixed text in code, report it and the options for letting the seeker's instruction change section headings, and STOP on that part for the product owner (do not change resume structure on your own). If the model ignored a clear instruction, report the exact prompt text and a proposed change for approval; do not change prompt text for this item.

ITEM 3: Newest version first on the Resume and cover letter page
Wherever the page lists resume or cover letter versions or drafts, show the newest first, so the version just generated is at the top. Keep everything else about the list unchanged.

ITEM 4: Newest draft first on Harper
When a question has an APPROVED answer and a newer DRAFT (currently shown as "New draft" beneath the approved answer), show the new draft above the approved answer, still labeled "New draft" with Approve and Edit, with the approved answer beneath it labeled as the current approved answer. Keep all other behavior unchanged.

ITEM 5: Cover letter writing quality
DEFECT: A generated cover letter opened two consecutive paragraphs with "At OpenText,". Add exactly this text to the cover letter generation instructions:
Vary how sentences and paragraphs begin. Never start two paragraphs with the same phrase. When two examples come from the same employer, name the employer once and connect the examples.
Change no other wording. Bump the cover letter prompt version per convention and report what the bump triggers (a new version is created only when the seeker generates or regenerates; nothing regenerates automatically or on a page view).

TESTS
Add automated tests that assert:
- After RESUME and COVER_LETTER jobs succeed, the page's generating state clears and the new versions display without a manual refresh; a failed job shows the failure; a gated skip clears the generating state and shows the "No Changes To ..." message.
- A regenerate instruction is included in the generation input and fingerprint, and a new instruction runs the generation (not skipped as unchanged).
- Resume and cover letter versions list newest first.
- On Harper, a new draft renders above the approved answer, labeled "New draft", with Approve and Edit.
- The cover letter prompt contains the exact new text.
- Rendering makes no paid call and enqueues no job.
Run the worker boundary test (--conditions=react-server). Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors. If a test fails only under full-suite load and passes alone, report it by name as a flake; do not change it to pass. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/resume-page-and-draft-order with a message naming the resume page, draft order, and cover letter writing fixes, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1: the cause and the fix, with file and line.
2. ITEM 2: the exact cause of the unapplied instruction; the fix; and any part stopped for the product owner, with options or proposed prompt text.
3. ITEMS 3 and 4: what changed, with file and line.
4. ITEM 5: the prompt text before and after, and the version bump with what it triggers.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; flakes by name; the worker boundary test result; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside these five items changed.

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Copy lives in the product config. One workflow: the Ask Harper answer uses Harper's existing question card (QuestionList and QuestionCard), Edit, and Approve. Reuse the existing role-expertise answers generation (writing model, through runPaidStructuredCall with its gate and free change check), the Harper library, and the existing fact-preservation rules; do not add a new AI prompt (report if any instruction change seems needed, and STOP on that part for approval). Use existing components, AppButton, and the existing orange (warning) design token; no new colors. No migrations or schema changes unless reported and approved first; no data repair. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Create a new worktree and a new branch from origin/main named fix/ask-harper. If origin/main does not include 47297ba (no reassess on notes and the Interview Notes section), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the three items below. Do not merge into main or push main. Change nothing else. Add no features.

ITEM 1: Ask Harper
1. Above the page header on the Harper page, the Interview Notes page, and the Interview Cheat Sheet, show exactly:
Have an interview question you're stumped on? Ask Harper!
with an orange button labeled exactly "Ask Harper", using the existing warning (orange) token.
2. Clicking it opens a question box (a text field and a button labeled exactly "Ask Harper"). Submitting creates a General question for this application with the seeker's question text and generates Harper's suggested answer through the existing role-expertise answers generation on the writing model, through the paid-call gate (an identical question for the same application makes no second paid call), with the Harper library and the existing rules (drawn from the Personal Profile, this job and company, and approved past answers; facts kept exactly as stated; no invented facts). Report the question's stored identity (for example a targetKey) and its interview-type tag handling.
3. The answer appears in the Ask Harper box as a Draft with Harper's existing card, Edit, and Approve, and the existing in-place working spinner while it generates.
4. On Approve, the question and its approved answer appear in General Questions on the Cheat Sheet and in the best-practice questions on the Harper page, exactly once each, with the same card. Before approval, the draft shows only in the Ask Harper box. An approved Ask Harper question is one of the General questions that persona and person likely-question refreshes can reference.
5. Report the exact paid calls and cost per question on the writing model.

ITEM 2: Side navigation order
Move Job requirements above Company in the application side navigation, so it reads 1. Application Status, 2. Job requirements, 3. Company, then the rest in their current order. Report everything that depends on step order or numbering (for example next-step logic, progress, sidebar status, and any "next step" links) and keep each working correctly.

ITEM 3: Learned notes no longer rebuild the Cheat Sheet
Saving the job page's learned notes no longer enqueues the APPLICATION_SUMMARY job (src/lib/application/service.ts about lines 981-987). Saving learned notes saves them and does nothing else paid. Report any other place learned notes are used, unchanged.

TESTS
Add automated tests that actually render the pages and drive actions with mocked providers and real Postgres, and assert:
- ITEM 1: the exact line and orange "Ask Harper" button appear above the header on Harper, Interview Notes, and the Cheat Sheet; clicking opens the box; submitting a question makes one writing-model call through the gate and shows the draft with Edit and Approve; submitting the identical question again makes no paid call; before approval the draft appears only in the Ask Harper box; after Approve the question and answer appear once in Cheat Sheet General Questions and once in Harper's best-practice questions; the answer keeps the seeker's facts exactly as stated; rendering makes no paid call and enqueues no job.
- ITEM 2: the side navigation order is Application Status, Job requirements, Company, then the rest; next-step logic, progress, and sidebar status still behave correctly.
- ITEM 3: saving learned notes enqueues no APPLICATION_SUMMARY job and makes no paid call; the notes are saved.
Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/ask-harper with a message naming Ask Harper, the side navigation order, and no Cheat Sheet rebuild on learned notes, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1: the banner, button, box, generation path, stored identity, and where approved answers appear, with file and line; the paid calls and cost per question.
2. ITEM 2: the order change and everything that depends on it, with file and line.
3. ITEM 3: what was removed, and other uses of learned notes.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
6. The commit hash, branch, and worktree path.
7. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these three items changed.

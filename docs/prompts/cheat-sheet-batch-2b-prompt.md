Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. One workflow: Harper and the Cheat Sheet share the same components (QuestionList and QuestionCard), the same actions, and the same behavior. Use Harper's existing approve path. No temporary fixes, no data repair, no migrations or schema changes unless reported and approved first, no prompt changes. Nothing on any page may make a paid call or enqueue a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub or any other in-progress branch. Create a new branch from main (currently 4326833, which includes the Cheat Sheet provider hotfix) named fix/cheat-sheet-batch-2b. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the five items below, per section C of docs/prompts/cheat-sheet-batch-2-plan-report.md where it applies, with the product owner's decisions below overriding the plan where they differ. Do not build the where-am-I change or the Harper library. Change nothing else. Add no features.

ITEM 1: Sample answers can be approved
DEFECT: A coach item or likely question with a generated sampleAnswer (shown as "Sample answer" when no Harper turn exists) has no Approve. The seeker must copy the sample, paste it, and save it.
FIX: Show the sample answer the same way Harper shows a suggested answer: labeled "Interview answer", with the Draft status, and Approve and Edit, plus the Save Answer form. Approve makes the sample the seeker's approved answer exactly as written, with no Harper rewrite and no paid call: create the question turn if it does not exist yet, store the sample as the interview answer statement, and approve it through Harper's existing approve path (including its ProfileStory handling). Edit lets the seeker change the sample text and save it as their draft (no paid call), then approve. Report exactly how the approve path is reused and confirm no provider call occurs.

ITEM 2: The thinking state holds until the outcome appears
DEFECT: After the seeker saves an answer, the card shows Harper is working, then briefly shows the question closed with only "Show your replies" and "Edit" (no draft, no follow-up, no message), and only then shows Harper's draft for approval.
FIX: Report, with file and line, what state the card renders between the reply being recorded and its outcome being written, and why it shows the closed state. Fix at the root so that while the reply for that question is pending or being processed (its turn not yet complete, or a job for it pending or running), the card keeps showing Harper's working state and the processing notice, and switches directly to the outcome (draft, follow-up, or needs-more-detail message) when it is written. No intermediate closed state. The page still updates by itself through the existing workspace refresher, with no paid call and no job from rendering.

ITEM 3: The question renders once
DEFECT: On the Cheat Sheet, a coach item shows its question as the item heading and again as the first line inside the Harper question card.
FIX: Show the question text exactly once per item, in one place, consistently on the Cheat Sheet and Harper's person view.

ITEM 4: General Questions section on the Cheat Sheet
- Add one section with the heading exactly: General Questions
  id general-questions, placed after At a glance and before the person sections, collapsible with the same heading treatment as the other Cheat Sheet sections, starting collapsed, opened by #general-questions. It stays visible when a person filter is selected (do not wrap it in CheatSheetSharedSection).
- It holds every general item once, as classified by partitionGeneralQuestionsForStanding: why this company, the career walk-through, role-expertise questions, requirement, gap, outcome, and competency questions, overview cheat-sheet gaps, and unmapped general leftovers. Each renders with Harper's QuestionList and QuestionCard (the same workflow and states as Harper).
- Stop rendering Additional Interview Prep Q&A under each person on the Cheat Sheet; those general items now appear only in General Questions. Harper's own person view is unchanged.
- Each person section keeps only that person's own items (their coach items, likely questions, and person-prep questions), except as ITEM 5 describes.
- Printing prints the section's full content without forms or buttons, like the other sections.

ITEM 5: One answer in both places for interviewer questions that match a General question
- When a person's likely question or coach item matches a General question, that person's section shows the General question's card (the same record, with the same answer and controls) in place of a separate question, so the seeker answers once and it shows in both places. Answering, editing, or approving it in either place updates the same record.
- Matching requires the same interview-type tag when both have one, and the question text is a near duplicate (reuse questionNearDuplicate). Ignore matches based only on a shared intent class.
- Never hide seeker content: if the person-specific item already has its own reply or answer, keep showing that person-specific item as it is, and do not merge or move data. Report how many such already-answered duplicates exist in the code's handling (no data changes).
- Interviewer questions that do not match a General question stay only with that person.

TESTS
Add automated tests that actually render the components (not source-text assertions) and assert:
- ITEM 1: a coach item with a sampleAnswer and no turn shows "Interview answer" with the Draft status, Approve, Edit, and Save Answer; Approve creates the turn if needed, stores and approves the sample exactly as written through the existing approve path, updates ProfileStory as that path does, and makes no provider call; Edit saves changed text as a draft with no provider call.
- ITEM 2: with a reply pending or processing, the card shows the working state and processing notice and never the closed state; when the outcome is written, the card shows it directly.
- ITEM 3: each item's question text renders exactly once.
- ITEM 4: with two Direct people, every general item renders exactly once under General Questions and not under either person; the section starts collapsed with the shared heading treatment; #general-questions opens it; it stays visible with a person filter selected; printing includes its content.
- ITEM 5: a person's likely question that matches a General question (same tag, near-duplicate text) shows the General question's card under that person, and answering it there updates the General record shown in General Questions (and the reverse); an intent-class-only match does not merge; a person-specific item that already has its own reply stays as is; non-matching person questions stay only with that person.
- No page render makes a paid call or enqueues a job, on both the Cheat Sheet and Harper's person view.
Run the worker boundary test (--conditions=react-server). Run npm test (default parallelism, including real-Postgres tests), plus the exact production build, the full type check, and lint. All must pass with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/cheat-sheet-batch-2b with a message naming the sample answer approve, thinking state, single question text, General Questions section, and shared General answers for interviewer questions, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1: how Approve and Edit work on a sample answer, with file and line, and confirmation of no provider call.
2. ITEM 2: the cause of the closed flash and the fix, with file and line.
3. ITEM 3: the change, with file and line.
4. ITEM 4: the section, which items it holds, and what was removed from person sections, with file and line.
5. ITEM 5: the matching rule, how the shared card renders under a person, and how already-answered duplicates are handled, with file and line.
6. Every file changed.
7. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
8. The commit hash and branch pushed.
9. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside these five items changed.

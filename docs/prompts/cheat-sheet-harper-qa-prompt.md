Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Production-grade code only. One workflow: the Cheat Sheet reuses Harper's existing question components (QuestionList and QuestionCard in ConsultationThread.tsx) and Harper's existing actions, not a parallel implementation. No temporary fixes, no data repair, no migrations or schema changes unless reported and approved first, no prompt changes. Nothing on any page may make a paid call or enqueue a job. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub or any other in-progress branch. Create a new branch from main named fix/cheat-sheet-harper-qa. If main does not include fix/outreach-mark-sent-inline, STOP and report. If anything unexpected happens, STOP and report.
SURGICAL RULE
Implement only the items below, per sections A, B, and D of docs/prompts/cheat-sheet-batch-2-plan-report.md, with the product owner's decisions below overriding the plan where they differ. Do not build the General Questions section, the where-am-I change, or the Harper library (later batches). Add no features.
PRODUCT OWNER DECISIONS
1. One workflow. Question and answer on the Interview Cheat Sheet works exactly as it does on Harper: the same states, labels, controls, and flow (the question, Save Answer, Skip, Ignore, Harper's draft Interview answer and Resume bullet with Approve and Edit, New draft above an approved answer, needs-more-detail and follow-up behavior, Approved badge and collapse, and Your reply collapsed). Different code paths are acceptable only where unavoidable; the seeker must never see or follow a different workflow.
2. The Cheat Sheet no longer links out to Harper to answer, edit, or approve. Everything is done inline on the Cheat Sheet, and the result is the same record Harper shows (a change on either page shows on both).
3. Interviewer-specific questions (a person's likely questions and coach items) are answered on the Cheat Sheet through Harper's normal reply flow: the reply is recorded, Harper shapes it into a draft through the existing process_reply job, and the seeker approves it. Nothing is approved automatically, and nothing is added to the Personal Profile unless the seeker approves it through Harper's existing approve path.
4. The Cheat Sheet never shows raw reply notes as the answer. Raw replies appear only as "Your reply", collapsed, exactly as on Harper.
IMPLEMENT
1. Render every question on the Cheat Sheet (each Direct person's likely questions and coach items, and the Additional Interview Prep Q&A under each person as it exists today) with Harper's QuestionList and QuestionCard and the existing Harper actions (reply, edit answer, approve, edit statement, skip, ignore). Remove the Cheat Sheet's links to Harper for answering, editing, and approving (workspaceHarperQuestionHref and workspaceHarperCoachItemHref on the Cheat Sheet branch, and editHrefForEntry in AdditionalInterviewPrepQa).
2. A coach item or likely question with no Harper turn yet: when the seeker saves an answer on the Cheat Sheet, create the question turn and record the reply through Harper's normal reply path so it is shaped into a draft by the existing process_reply job and waits for approval. Replace answerCheatSheetCoachItem's immediate approval, ProfileStory upsert, and profile fact append with that normal flow. Report exactly what answerCheatSheetCoachItem did before and what now happens.
3. Report how Harper's person view shows a coach item's generated sampleAnswer today, and show it on the Cheat Sheet the same way (one workflow).
4. Every Cheat Sheet action revalidates both /campaigns/{id}/summary and /campaigns/{id}/consultation (and /campaigns/{id}) so both pages show the change.
5. saveEditedConsultationStatement: when the edited statement is already approved, also update the matching ProfileStory interviewAnswer or resumeBullet, so the profile copy never diverges from the approved answer. No paid call and no job.
6. The Batch 1 behavior stays: Cheat Sheet sections collapsible and starting collapsed; printing shows full content without forms or buttons; the Batch 1 Harper behaviors are unchanged.
TESTS
Add automated tests that assert:
- The Cheat Sheet renders questions with Harper's QuestionList and QuestionCard; the same states, labels, and controls appear on both pages for the same question.
- Saving an answer, editing a draft, approving, skipping, and ignoring on the Cheat Sheet update the same records Harper shows, and the change appears on Harper (and the reverse).
- A coach item with no turn, answered on the Cheat Sheet, becomes a draft awaiting approval through process_reply; it is not auto-approved; no ProfileStory or profile fact is written until the seeker approves.
- No link from the Cheat Sheet sends the seeker to Harper to answer, edit, or approve.
- Raw replies never render as the answer on the Cheat Sheet; they appear only as the collapsed "Your reply".
- Editing an approved statement updates the matching ProfileStory with no paid call and no job.
- The sampleAnswer displays the same way on both pages.
- No page render makes a paid call or enqueues a job.
Run the worker boundary test (--conditions=react-server). Run npm test (default parallelism, including real-Postgres tests), plus the exact production build, the full type check, and lint. All must pass with zero errors. Never change an existing test only to make it pass; report any test changed and why.
COMMIT
After everything passes, commit on fix/cheat-sheet-harper-qa with a message naming the Cheat Sheet using Harper's question and answer workflow, and push that branch. Do not merge into main or push main.
REPORT
1. How the Cheat Sheet now renders and acts on questions, with file and line, and any place a separate code path was unavoidable (and why the seeker sees no difference).
2. What answerCheatSheetCoachItem did before and what happens now.
3. The sampleAnswer finding.
4. The ProfileStory update on editing an approved statement.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside these items changed.

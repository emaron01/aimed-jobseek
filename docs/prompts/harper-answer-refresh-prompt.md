Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no schema changes, no Harper prompt changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub. Create a new branch from main named fix/harper-answer-refresh. If main does not yet include fix/harper-standing-structure (the three-section page), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the three items below. Change nothing else. Add no features.

ITEM 1: A seeker's own answer must become Harper's cleaned-up draft
DEFECT: On a Best-practice (role-expertise) question with Harper's suggested draft, the seeker wrote a complete answer of their own (an edited, improved version of the draft) and saved it with Save Answer. After Harper finished processing, the reply was stored as "Your reply", but the Interview answer shown for approval stayed Harper's original draft. The seeker's reply began: "Enterprise demand generation works best when Marketing and Sales share a precise view of priority accounts..." and included "Across my career, most recently at Login VSI and OpenText, I built cross-functional partnerships with Marketing...".
PRODUCT OWNER RULE: When the seeker saves an answer, Harper cleans it up and it becomes the new draft for approval, replacing her previous suggested draft (never replacing an APPROVED answer). The rule that "the seeker's raw reply is never shown as Harper's result" exists to stop non-answers (meta commentary about the question, fragments, raw notes) from being shown as Harper's work. It must not reject a clean, complete answer just because Harper's cleanup is nearly identical to what the seeker wrote.
INVESTIGATE (file and line): trace this case through record, drain, extract, polish, the quality checks (isRawSeekerResult, isParaphrasedSeekerReply, isQuestionMetaCommentary, the D3 parts validation), and the supersede of the draft stored on the question turn. State exactly why the draft was not replaced (echo rejection, needs-more-detail, supersede not reaching the question-turn draft, or something else).
FIX at the root:
- A polished answer that passes the answer quality checks (all required parts present, result states an outcome, no labels, no meta commentary, not a fragment) is accepted even when it is nearly identical to the seeker's reply. The echo check still rejects results that are fragments, meta commentary about the question, or raw notes that are not an answer.
- The accepted cleanup replaces the previous DRAFT suggested answer for that question (the draft on the question turn and any earlier draft), shown as Interview answer, Draft, with Approve and Edit. An APPROVED answer is never replaced.
- Apply the same rule to every question kind (Best-practice, gap, why this company, career walk-through), not only role-expertise.

ITEM 2: Follow-up hint in Section 2
Under any Harper follow-up question in "Questions that need more information", show exactly:
To answer Harper's follow-up, open Your reply, add the details she's asking for, and save.

ITEM 3: Section headings must look like section headings
The three section headings (Where you stand; Questions that need more information; Best-practice interview questions for a {job title}) currently look like questions, so a seeker does not know they can be collapsed or expanded.
- Style each section heading distinctly from questions using the app's existing darker blue (an existing design token or class already used in the app; do not introduce a new color), for example a darker blue heading bar or heading text, consistently across all three.
- Show an expand and collapse indicator on each heading: an arrow pointing right when the section is collapsed and down when it is open, updating as it toggles.
- Keep the description visible under the title, the AppButton heading, aria-expanded, and all three sections starting open.

TESTS
Add automated tests that assert:
- A complete, well-formed seeker answer saved on a question with a DRAFT suggestion produces a new cleaned-up DRAFT that replaces the old one, even when the cleanup is nearly identical to the reply (use the reported reply text as a fixture).
- Fragments, meta commentary about the question (for example "Clarified that a company statement needed to be reframed as an interview question."), and raw notes are still rejected and not shown as Harper's result.
- An APPROVED answer is never replaced by a later reply.
- The same behavior holds for a gap question, why this company, and the career walk-through.
- The follow-up hint text is exact and shows only under follow-up questions in Section 2.
- Each section heading uses the darker blue styling, differs from question styling, and shows the indicator pointing right when collapsed and down when open, with aria-expanded matching.
- Rendering makes no paid call and enqueues no job.
Run the worker boundary test (--conditions=react-server). Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors. If a test fails only under full-suite load and passes alone, report it by name as a flake; do not change it to pass. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/harper-answer-refresh with a message naming the Harper answer refresh, follow-up hint, and section heading fixes, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1 investigation: exactly why the draft was not replaced, with file and line.
2. ITEM 1 fix: the narrowed echo rule and the supersede change, with file and line.
3. ITEM 2: where the hint renders.
4. ITEM 3: the styling used (which existing token or class) and the indicator, with file and line.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; flakes by name; the worker boundary test result; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside these three items changed.

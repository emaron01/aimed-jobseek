Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no schema changes, no prompt changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Uncommitted B4 work (moving Delete my account to Account settings) exists on checkpoint/harper-prep-hub: do not modify, stash, or discard it. Do this work on a new branch from main named fix/harper-page-usability. If anything unexpected happens, STOP and report.

SURGICAL RULE
PART A: implement only the six fixes listed. PART B: report only, no changes. Do not change Harper's prompts, planning, answer processing, paid calls, or any other page. Add no features.

CONTEXT
In production, the Harper page (ConsultationSection, ConsultationStanding, ConsultationThread, and related components) is hard to use: typed answers are lost, the page jumps around after saving, buttons are stacked and duplicated, question text repeats, and after answering one question the seeker could not find Harper's result.

PART A: FIX
1. Keep unsaved answers: submitting one answer must never clear text typed in any other answer box on the page. Keep each unsaved draft in client state for the page's lifetime so it survives a submission and the refresh that follows. Report the root cause (for example a full-page refresh, a re-keyed component, or a remount) and fix that cause.
2. No jumping: after saving an answer, Ignore, Skip, or Edit, the page stays at the same place (the question just acted on stays in view). No automatic scroll to the top or elsewhere.
3. Buttons: each question shows one set of action buttons (Reply or Save Answer, Skip, Ignore or Ignored, Edit), laid out side by side in a single row, using the app's smaller button size. Remove the duplicated labels ("Reply Reply", "Edit Edit") at the root (report why each rendered twice).
4. Question text once: each role-expertise question (and any other question) shows its text once, not as both a heading and a body. Report the cause.
5. Rename the "Share some details" button to exactly: Save Answer. Keep its behavior.
6. Processing notice: while Harper is working on the seeker's answers (wherever the page already shows Harper is busy), show exactly: This process can take several minutes.

PART B: REPORT ONLY
1. Where you stand, with file and line: why "Why you want to work at this company" renders three times with different statuses (Open at the top, None at the bottom); why "Proven success scaling high-performance teams across expansion and new logo motions" shows Open in one place and Partial in another; why a Required item and a near-copy scorecard competency ("Demonstrated experience building strong front-line management layers..." and "Ability to build strong front-line management layers...") both appear; what the top summary list, the "Expand all" topic list, and the requirement list each are and where they come from; and a proposal so every requirement and topic appears once, with one status, with its questions and answers inline under it. Do not implement.
2. The Pause button (and Done and Skip the rest): exactly what each does, what triggers it, what state it changes, and whether it makes or stops paid calls. Do not change.
3. Harper's result landed on the wrong question: the seeker answered the requirement "Ability to build strong front-line management layers and develop elite sales talent." (reply mentioning MDA, Merion, KPIs, and "3 of 4 reps have over achieved in FY26"). No draft answer appeared there to review or approve. Instead, coaching that responds to that reply ("You have strong themes—manager development, structured coaching, clear KPIs, promotions, and three of four representatives exceeding target...") and a follow-up question ("Which specific team at Marketing Database Associates or Merion Publications did you develop...") appeared under a different question: "If we spoke with your recent leaders and peers, what would they say about your leadership style and impact?". Trace, with file and line, from the reply submission through recording, the consultation drain, extract, polish or follow-up, and how the result or follow-up is attached (replyToTurnId, targetKey, supersede logic) and rendered. State exactly why the result attached to the other question, whether a draft was produced and where it is stored, and whether this can happen for any reply. Propose the root-cause fix so a reply's draft, coaching, or follow-up always appears under the question the seeker answered. Do not implement.

TESTS
Add automated tests that assert: typing in two answer boxes and submitting one keeps the other's text; saving, Ignore, Skip, and Edit do not change the scroll position; each question renders one row of side-by-side action buttons with no duplicated labels; each question's text renders once; the button reads exactly "Save Answer"; the processing notice shows the exact text while Harper is busy; rendering makes no paid call and enqueues no job. Run the worker boundary test (--conditions=react-server). Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/harper-page-usability with a message naming the Harper page usability fixes, and push that branch. Do not merge into main or push main.

REPORT
1. PART A: each fix, its root cause, and the change, with file and line.
2. PART B: the Where you stand findings and proposal; what Pause, Done, and Skip the rest do; and the wrong-question trace, cause, and proposed fix.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
5. The commit hash and branch pushed.
6. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside PART A changed.

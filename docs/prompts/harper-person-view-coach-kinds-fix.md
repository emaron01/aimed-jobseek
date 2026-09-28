SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no output filtering, no temporary fixes, no data repair, no migrations, no schema changes. Never silence type or lint errors.

SURGICAL RULE
Fix only the rendering of the three coach item kinds below in Harper's person view. Do not change the Cheat Sheet page (it keeps its answer forms until Batch B4), Stage, Outreach, Harper's prompts or planning, learnings, the Phase 1 gate, serialization, or any paid call. Rendering must never enqueue a job or make a paid call. Add no features.

STEP 0: DEPLOYED COMMIT CHECK (report only)
Production is on main at 655eff6, which is not one of the approved commits 5e9b0de (Harper Batch B3) or 14b6fcd (B3 person-view answer fix and Stage help text). Run git log --oneline 6540360..655eff6 and git show --stat for every commit in that range. Report every commit and every file. State plainly whether any commit other than 5e9b0de and 14b6fcd changes anything outside docs/. Do not change anything for this step.

CONTEXT
The B3 person-view answer fix (docs/prompts/harper-b3-person-view-answer-fix-report.md) found four coach item kinds that can need seeker input (harperQuestion set). Only likely questions ({sectionKey}:likely:{n}) render in CheatSheetPersonBody. Recruiter flag answers ({sectionKey}:flagAnswers:{n}), Hiring Manager drill-downs ({sectionKey}:drill:{n}), and Hiring Manager gaps ({sectionKey}:gap:{n}) do not render in the person profile, so if they need input they cannot be answered on Harper, and after Batch B4 makes the Cheat Sheet read-only they could not be answered anywhere.

REPORT FIRST, THEN IMPLEMENT
Before changing code, report with file and line:
1. Where flagAnswers, drill, and gap coach items render today on the Cheat Sheet page (or anywhere else), with their surrounding guidance, and whether they show answer forms there.
2. How often each kind is generated with harperQuestion set (which person kinds, for example recruiter or Hiring Manager).
3. Whether any of these kinds already has answers stored as cheatSheet:{itemId} turns.

FIX
1. In Harper's person view, render flagAnswers, drill, and gap coach items in context, in the same place and with the same surrounding guidance they have on the Cheat Sheet page, using the existing rendering where possible.
2. Items that need seeker input show their answer form inline, using the existing answer path (answerCheatSheetCoachItem, record-before-enqueue, reply waits for Harper). Answer forms are hidden or disabled while Harper is analyzing.
3. Each item and its answer render once on Harper, in its place in the profile, and are not repeated in the separate person list. The render invariant counts them, so every item with seeker content or an open question renders exactly once.
4. "Edit", "Show your replies", "Ignore" and "Ignored" behave as Batch A decided.
If any of these kinds never renders on the Cheat Sheet page and never has harperQuestion set, report it and make no change for that kind.

TESTS
Add automated tests that assert:
- flagAnswers, drill, and gap coach items render in Harper's person view in context, matching the Cheat Sheet page.
- An unanswered one that needs seeker input shows an answer form inline and uses the existing answer path.
- An answered one renders once, in its place, not also in the separate list.
- The render invariant holds for all four coach kinds.
- Answer forms are hidden or disabled while Harper is analyzing.
- The Cheat Sheet page is unchanged.
- Rendering enqueues no job and makes no paid call.
Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on branch checkpoint/harper-prep-hub (update it from main first) with a message naming the Harper person-view coach kinds fix, and push that branch. Do not merge into main or push main.

REPORT
0. STEP 0 findings.
1. The report-first findings.
2. What changed, with file and line, or which kinds needed no change and why.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; the test suite, build, type check, and lint results.
5. The commit hash and branch pushed.
6. Confirmation that nothing outside this fix changed.

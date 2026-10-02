Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Copy lives in the product config (src/lib/product-config/). Use existing components, the existing collapsible heading treatment, the existing orange warning notice, and AppButton; no new colors. Reuse the existing Remove from Cheat Sheet action. No database migrations or schema changes, no data repair, no AI prompt changes. Hiding a persona never deletes data. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the existing fix/personas-page-layout or fix/personas-layout branches or worktrees, the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1, or the untracked files in C:/Repos/aimed-jobseek. Create a new worktree and a new branch from origin/main named fix/cheat-sheet-batch-3. If origin/main does not include 919c9e4 (persona activation data loss fix), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the four items below. Do not merge into main or push main. Change nothing else. Add no features.

ITEM 1: Remove from Cheat Sheet on the Cheat Sheet
On each persona card on the Interview Cheat Sheet (a persona added to the Cheat Sheet with no person attached), add a "Remove from Cheat Sheet" button next to Print this section and Refresh likely questions. It runs the existing remove action: it hides the persona from the Cheat Sheet (clears cheatSheetActivatedAt) and keeps its stored section and question ids. Person sections do not get this button.

ITEM 2: Cheat Sheet print fixes
DEFECT: Print this section prints Likely questions as empty boxes (no question or answer text) and Questions to ask them as blank; the collapsed arrow still shows on headings in print; and a scrollbar shows in print.
1. Report, with file and line, why each prints empty (for example the on-screen card is hidden in print and these items have no print version).
2. Fix at the root so in print: each likely question prints as its question, with its approved answer beneath when one exists (or the question alone); Questions to ask them prints as a plain list of the questions; no empty boxes, no pills or badges, no buttons, links, or forms, no arrows on headings, and no scrollbars; collapsible sections print expanded. "Approved answers only." stays at the top. This applies to both Print this section and printing the whole page.

ITEM 3: Personas page layout
1. Move the orange notice ("Harper identified these Hiring Team roles from the job posting and company research. Select the roles that align to the title or responsibilities of the person who you are interviewing with. NOTE: You can select personas as they are identified.") to the top of the Personas and Interviewers page, above the "Personas and Interviewers" heading and everything else. Same text and orange box.
2. Put the add form (Name, Likely titles, Department, Why this role matters, Notes, "Saved templates are added only when you choose one.", and its button) in a collapsible section that starts collapsed, titled exactly "Add a new persona", with its submit button renamed exactly "Add persona". Fields, validation, and saving are unchanged; after adding, the section collapses and the new persona appears in the list.

ITEM 4: One name for building persona research
Rename every control that builds a persona's research (the same persona build job), including "Generate Hiring Team role" on Personas and Interviewers and the build persona control on the Cheat Sheet and Harper's person view, to exactly "Generate persona research", and their in-progress status message to exactly "Researching this persona…". Report every control renamed, with file and line, and confirm they run the same job. Do not rename the Cheat Sheet's Generate control for a missing interviewer section, Refresh likely questions, Add to Cheat Sheet, Remove from Cheat Sheet, or the "Hiring Team role" field, column, or dropdown labels.

TESTS
Add automated tests that actually render the components (and drive actions with mocked providers) and assert:
- ITEM 1: persona cards on the Cheat Sheet show Remove from Cheat Sheet next to Print and Refresh; clicking it hides the persona and keeps its stored section and question ids; adding it back shows the same section with no paid call; person sections have no such button.
- ITEM 2: print shows likely questions as question plus approved answer (or the question alone), Questions to ask them as a plain list, no empty boxes, no arrows, no scrollbars, sections expanded, and "Approved answers only." at the top, for Print this section and the whole page.
- ITEM 3: the notice is the first content on Personas and Interviewers with the exact text; Add a new persona starts collapsed, opens on click, saves with the "Add persona" button, and collapses after adding.
- ITEM 4: every persona-build control reads exactly "Generate persona research" with the status "Researching this persona…" and the same behavior; the excluded controls are unchanged.
- Rendering makes no paid call and enqueues no job.
Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/cheat-sheet-batch-3 with a message naming Remove from Cheat Sheet on the Cheat Sheet, Cheat Sheet print fixes, the Personas page layout, and the Generate persona research name, and push that branch. Do not merge into main or push main.

REPORT
1. Each item: what changed, with file and line; for ITEM 2, why each printed empty; for ITEM 4, every control renamed.
2. Every file changed.
3. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
4. The commit hash, branch, and worktree path.
5. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these four items changed.

# IMPLEMENT Phase A — Gate employer ICP / Target Employer / Employer fit off

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Switch the features off at their entry points so no page, action, job, or worker path can run them or make a paid call for them. Do not delete code, schema, or data in this phase. No temporary hacks: use the codebase's existing gating mechanism (requireGatedPage / assertGatedAction and the flags in features.ts). No data repair, no migrations.

SURGICAL RULE
Change only what is needed to switch off employer ICP, Target Employer, and Employer fit. Do not delete any code or schema. Do not change the job Scorecard, Harper, hiring team, personas, research, assets, outreach, or cheat sheet behavior except where they call ICP or Employer fit, as listed below. Add no features.

CONTEXT
Your plan (docs/prompts/remove-employer-icp-fit-plan.md) inventoried every ICP, Target Employer, and Employer fit path. The product owner has decided on two phases. Phase A (this prompt): switch it all off so it cannot run or cost money, fully reversible. Phase B (later): investigate downstream impact before any code is deleted.

SWITCH OFF
1. Add one flag to features.ts, off by default, covering employer ICP, Target Employer, and Employer fit. Follow the existing flag pattern exactly.
2. Pages: every ICP and Target Employer route (/icps, /icps/new, /setup/[productId]/icps/**, and any other from the plan) is gated with requireGatedPage on the new flag.
3. Actions: every ICP, Target Employer, and Employer fit server action (upsertIcpAction, deleteIcpAction, previewStarterTargetEmployerAction, approveStarterTargetEmployerAction, interpretIcpAction, the criterion actions, rescoreApplicationFitAction, overrideApplicationFitAction, and any other from the plan) is gated with assertGatedAction on the new flag.
4. System paths: when the flag is off, finishApplicationAfterResearch does not call scoreFit or write ApplicationFit, and identity or research staleness does not touch ApplicationFit. Research itself, and everything else research-finish does, is unchanged.
5. UI: when the flag is off, the setup product page does not show the "2. Target Employer" panel and has no link to a gated page; setup numbering and the setup complete-line (home-setup-line.ts) do not count or mention ICPs; the application page does not render the Employer fit section, its override, or its rescore; the overview shows no fit. The job Scorecard section renders exactly as today.
6. Harper review_fit: report exactly what review_fit is, what triggers it, and what it reads. If switching off Employer fit requires any change to Harper's prompt text, do not change it: show the exact current text and stop for approval on this item only. If it only requires not triggering review_fit when the flag is off, make that change.
7. Anything else the plan lists that can make an ICP or Employer fit paid call must be unreachable with the flag off.

TESTS
Add automated tests that assert, with the flag off:
- Every gated ICP and Target Employer page returns not found.
- Every gated action rejects without calling generateIcpInterpretation, interpretIcpDefinition, previewStarterTargetEmployer, or any fit scoring function.
- finishApplicationAfterResearch makes no fit call and writes no ApplicationFit, while research completes as before.
- The application page renders no Employer fit section and still renders the job Scorecard unchanged.
- Setup shows no Target Employer panel and the complete-line does not count ICPs.
- Harper runs without review_fit being triggered (or per item 6's approval).
- The existing no-ai-on-view tests still pass.
Run the full existing test suite, including real-Postgres tests, and confirm it passes with no new failures. Do not delete existing ICP or fit tests; if a test fails only because the flag is now off, run it with the flag on and report each one.

REPORT
1. The flag name and every page, action, and system path gated, with file and line.
2. Item 6: what review_fit is and what changed, or the text awaiting approval.
3. Every file changed.
4. Tests added and any existing tests adjusted for the flag, and the full test suite result.
5. Confirmation that no code, schema, or data was deleted, and that the Scorecard, Harper, hiring team, personas, research, assets, outreach, and cheat sheet behave as before.

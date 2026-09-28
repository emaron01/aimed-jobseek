# Hide gated ICP / Employer fit seeker surfaces + serialize test root cause

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Production-grade code only. Fix at the root cause. Never change a test just to make it pass; a test changes only when the behavior it checks was intentionally changed. No temporary fixes, no data repair, no migrations.
SURGICAL RULE
Change only what is needed for ITEM 1 and ITEM 2 below. Do not change the employerIcpFit flag, the gates already added, or anything else. Add no features.
CONTEXT
Phase A (docs/prompts/gate-employer-icp-fit-phase-a.md) switched off employer ICP, Target Employer, and Employer fit behind the employerIcpFit flag. Its report also listed a change to src/lib/application-jobs/serialize-same-key.test.ts ("claim isolation via pinClaimFirst; not feature logic"), which is outside that prompt's scope.
ITEM 1: The serialization test change.
- Report exactly what changed in serialize-same-key.test.ts (before and after) and why: which test failed or was flaky, the exact failure, and what caused it.
- Determine whether the cause is in the test (for example, test isolation between real-Postgres tests) or in the claim code (claimNextApplicationJob ordering, locking, or eligibility). Cite the code.
- If the cause is in the claim code, revert the test change, fix the claim code at the root, and report it. If the cause is only test isolation, keep a test-only fix, explain why the test still asserts the same behavior it asserted before, and confirm the claim behavior it checks is unchanged.
ITEM 2: No seeker-facing surface may lead to a gated ICP or Employer fit action.
- Find every component, page, form, button, link, and onboarding or starter step that calls any action gated by employerIcpFit (including previewStarterTargetEmployerAction and approveStarterTargetEmployerAction) or links to a gated page. List each with file and line.
- For each one, confirm it is not rendered when employerIcpFit is off. Where it is still rendered, hide it with the same flag, so a new seeker going through signup, onboarding, and setup never sees a Target Employer step or any control that would call a gated action.
- Confirm that onboarding and setup still complete for a new seeker with the flag off, with no step left waiting on Target Employer.
TESTS
Add or update automated tests that assert, with employerIcpFit off:
- No component or step that calls a gated action or links to a gated page is rendered, including onboarding and starter steps.
- A new seeker's onboarding and setup complete with no Target Employer step.
For ITEM 1, the serialization claim tests assert the same claim behavior as before. Run the full existing test suite, including real-Postgres tests, and confirm it passes with no new failures.
REPORT
1. ITEM 1: the test change, the failure and its root cause, and what was kept, reverted, or fixed.
2. ITEM 2: every surface found, whether it was already hidden, and what changed.
3. Every file changed.
4. Tests added or updated and the full test suite result, confirming the real-Postgres tests ran.
5. Confirmation that nothing outside ITEM 1 and ITEM 2 changed.

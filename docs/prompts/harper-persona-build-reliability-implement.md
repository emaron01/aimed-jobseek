# IMPLEMENT — Personas and Interviewers build reliability (plan v2 + PO decisions)

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Implement the approved plan docs/prompts/harper-persona-build-reliability-plan-v2.md with the product owner's decisions below, which override the plan where they differ. Fix at the root; no output filtering, no temporary fixes, no data repair, no migrations of existing data. No schema changes.

SURGICAL RULE
Change only what the plan and these decisions require. Do not change persona or Harper prompt text, models, providers, the Phase 1 gate beyond what is specified, serialization, the employerIcpFit gating, or any UI beyond what is listed. Add no features.

STEP 0: VALIDATE THE QUALITY CHECK BEFORE WIRING IT IN
assessHiringTeamDraft has never run on a live build. Before wiring it into synthesis:
- Run it against every built general persona narrative available in the local development database and in existing test fixtures.
- Report the count checked, the count it would reject, and for each rejection the reason and the classification (fixable or not enough real information).
- If it rejects any persona that has a complete, specific narrative built from real job and research evidence, STOP: do not wire it in or implement anything else. Report the rejected personas and the rules that rejected them for approval.
- If it rejects none, or only genuinely deficient drafts, continue.

PRODUCT OWNER DECISIONS
1. One incomplete state. Any build that cannot complete (not enough real information, or temporary failures after all automatic retries) leaves the role unbuilt in a single waiting-for-details state, whether Harper suggested the role or the seeker added it. Nothing is saved as a built persona. The seeker adds details through the role card's Edit or the Add form, which changes the fingerprint and runs the build.
2. Recording incomplete builds (the plan's PaidCallReceipt sentinel):
   - Not enough real information: an unchanged retry makes no paid call, with no time limit. Only an input change runs the build again.
   - Temporary failure after all automatic retries: an unchanged retry makes no paid call for 1 hour after the failure is recorded. After 1 hour, an unchanged retry runs the build again.
   Keep the two kinds distinguishable in the record.
3. Quality check wired into synthesis (subject to STEP 0). A fixable rejection regenerates automatically once, passing the rejection reason back to the model (a new fingerprint). If the regeneration also fails, or the rejection is not enough real information, the role enters the waiting-for-details state.
4. Temporary failures retry automatically in the background worker, consistent with serialization and Phase 1 crash safety, before the role enters the waiting-for-details state.
5. Missing configuration (SYNTHESIS_UNAVAILABLE) is detected before seekers are affected, per the plan, and never shows system language to the seeker.
6. An edited role with no built narrative never counts as built (isHiringTeamPersonaBuilt and step color).
7. Approved stays, and only applies when a real built narrative exists.
8. modelNote is never rendered to the seeker (remove the render in ApplicationWorkspace.tsx 1310-1311); keep it stored.
9. Move the existing Add Hiring Team role form to the top of the page, above the Direct section, relabeled "Add Interviewer Title / Persona". Fields, validation, and behavior unchanged.
10. Status chips. Replace every role-card status label with exactly:
   - Identified (not built): no chip.
   - Starting… and Generating: "Building…" with the existing spinner.
   - Ready: no chip.
   - Stale: "Details changed: Regenerate to update"
   - Waiting for details (including what was Failed): "Add more details to build this persona"
   - Approved: "Approved"
   No other status text is shown to the seeker. The action buttons ("Generate {persona}", "Regenerate", and the existing Retry path) keep their current behavior unless the plan requires a change, in which case report it.

TESTS
Add automated tests that assert:
- modelNote is never rendered.
- A fixable quality rejection regenerates exactly once with the rejection reason.
- A build that cannot complete saves no persona and leaves the role in the waiting-for-details state with the chip "Add more details to build this persona".
- Not enough real information: an unchanged retry makes no paid call, at any time.
- Temporary failure: an unchanged retry within 1 hour makes no paid call; after 1 hour it runs the build.
- Adding details through Edit or the form changes the fingerprint and builds the persona.
- Temporary failures retry automatically and then succeed without double-paying.
- Missing configuration is detected before a seeker build runs and shows no system language.
- An edited role with no narrative never counts as built and does not turn the step green.
- No build starts without a seeker action.
- Each status shows exactly the chip text above, and no other status text appears.
- The form renders at the top labeled "Add Interviewer Title / Persona" with unchanged fields and behavior.
- Phase 1 skips and "No Changes To {role name} Persona" still behave as before.
Run the full existing test suite, including real-Postgres tests, and confirm it passes with no new failures. Never change an existing test only to make it pass; report any test changed and why.

REPORT
1. STEP 0 results: personas checked, rejections, and whether you continued or stopped.
2. How each decision was implemented, with file and line.
3. The final status-to-chip mapping as implemented.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test, and the full test suite result, confirming the real-Postgres tests ran.
6. Confirmation that no prompt text, schema, serialization, or employerIcpFit behavior changed, and nothing outside this scope changed.
7. Any deviation from the plan or these decisions, with the reason.

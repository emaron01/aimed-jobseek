Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. No temporary fixes, no data repair, no migrations, no schema changes.

SURGICAL RULE
Change only the Job Requirements page as listed below. Do not change the job parse call (interpretJobPosting), its prompt, what it produces (including scorecardJson), or any feature that reads its output. Do not change Harper's page or Harper's assessment. Do not remove any other section, button, or control. Add no features.

PRODUCT OWNER DECISIONS (Job Requirements page only)
1. Remove the "Scorecard" section from the Job Requirements page: its heading, mission text, Outcomes, Competencies, and the line "This scorecard is based on your Personal Profile and the job posting. The more Harper knows about you, the more it may change." Harper's assessment on the Harper page stays exactly as it is.
2. Remove the "Regenerate" button from the Job Requirements page. Saving an edited posting ("Edit posting") keeps working exactly as today.
3. No Employer fit section on the Job Requirements page (ICP was scrapped).

STEP 1: REPORT FIRST
1. Every reader of scorecardJson outside the Job Requirements page display (persona identification evidence, Harper, cheat sheet, resume, cover letter, outreach, anything else), with file and line, confirming none of them depends on the page display.
2. The Regenerate button: its component, the action it calls, and every other caller of that action. State whether the action has any caller besides this button.
3. Employer fit on this page: every part that could render here, and whether each is already hidden by the employerIcpFit flag (off by default).

STEP 2: IMPLEMENT
1. Remove the Scorecard section's rendering from the Job Requirements page. Keep all other sections (Job requirements fields, Responsibilities, Required, "Enter any new requirements you have learned here", Edit posting) unchanged.
2. Remove the Regenerate button. If the action it calls has no other caller, remove that action too, so no path can run it. If it has other callers, keep the action and report them.
3. If any part of Employer fit still renders on this page with employerIcpFit off, hide it with the same flag. If it is already fully hidden, change nothing for this item.

TESTS
Add or update automated tests that assert:
- The Job Requirements page renders no Scorecard section and not the removed line.
- The Job Requirements page renders no Regenerate button, and the removed action (if removed) no longer exists.
- Saving an edited posting still works as before.
- With employerIcpFit off, no Employer fit content renders on this Job Requirements page.
- Every reader of scorecardJson found in STEP 1 still receives it unchanged.
- Harper's page and assessment render as before.
Run the full existing test suite, including real-Postgres tests, and confirm it passes with no new failures. Never change an existing test only to make it pass; report any test changed and why.

REPORT
1. STEP 1 findings.
2. What changed for each decision, with file and line.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test, and the full test suite result, confirming the real-Postgres tests ran.
5. Confirmation that the job parse call, its output, Harper, and everything outside the Job Requirements page are unchanged.

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

TASK: Resolve the walkthrough decisions. Work on main. Commit and push when all checks pass. Do item 1 first; it is the most important.

1. Employer identity verification (critical)
Research bound "Acme Robotics" to an FTC student robotics team for a commercial warehouse-robotics posting, and the wrong identity flowed into the Hiring Team and Application Summary.
- Before research results are attached to an application, verify the identity against the job requirement: industry and what the company does, location, size or stage where stated, and any website or domain in the posting. Research returns the evidence for each check.
- Any material mismatch marks the identity ambiguous. Nothing downstream (employer fit, Hiring Team drafting, consultation context, assets, outreach, interview guides, Application Summary) uses unconfirmed research. The seeker sees the candidate identity with the evidence and confirms it, rejects it, or supplies the correct company name or website, which reruns research.
- Existing applications whose research fails verification are marked ambiguous, and their dependents are marked stale.
- Add a Retry research control on the application for failed or skipped research.
- Test with the fixture posting against a mismatched identity (a student team with the same name): it must be marked ambiguous, and no downstream generation may use it.

2. Signup and setup
- Remove the Company name field from signup. The organization is named automatically from the seeker's name (format from configuration). Relabel "Work email" as "Email".
- Move Voice after Personal Profile in the setup rail and mark it optional.
- In local development only, log the email verification URL from the console email provider.

3. Personal Profile
After approval, the Personal Profile page shows the approved profile, with the option to add material and rebuild.

4. Target Employers labels
Replace internal scoring language in seeker-facing labels, via the vocabulary module: "Scoring criteria" becomes "What you're looking for", "From company research" becomes "Checked against company research", and "Interpret" or "Reinterpret Target Employer profile" becomes "Update from my description".

5. Plan entitlements
When an organization's plan changes (including a comped conversion), apply that plan's entitlements to its usage policy. Test that a plan change updates the research allowance.

6. Harper proposals
Proposed facts must be complete, self-contained statements that make sense on their own. Fragments are rejected and not shown for confirmation.

7. Cover letter closing
A closing paragraph may have no citation only when it makes no claim (a request for a conversation, a thank-you). Any claim in the closing still requires a citation. Test both cases.

8. Upcoming reminders
After Applied (and after a message is marked sent), Home shows upcoming reminders with their due dates, not only reminders that are already due.

9. Interview guide repetition
In interview guides, the same fact or metric may appear in different sections (for example, a talking point and a labeled example answer). Within a single section, repetition is still rejected. Test both.

10. Interview-gap consultation
When the seeker accepts the offer after a stage reveals a new gap, open a focused Harper session targeting that gap, even if the original consultation is done. The original consultation's history stays intact.

11. Repository hygiene
Remove scripts/ad-hoc/walkthrough-*.ts from the repository, and add scripts/ad-hoc/ to .gitignore. Tools that unlock billing or grant research never belong in the repository.

After all fixes, rerun steps 4, 5, 7, 11, and 12 of the walkthrough with the walkthrough account: confirm the identity is flagged ambiguous, then confirm the correct identity (if the fixture company has no real match, reject the research and continue without it), and regenerate the Hiring Team, cover letter, recruiter guide, thank-you, and Application Summary.

REPORT
For each item: what changed and its test. The rerun results with exact text for the cover letter, recruiter guide, thank-you, and the Application Summary company section. Files changed, commits, and a full-suite result. Delete the walkthrough account at the end.

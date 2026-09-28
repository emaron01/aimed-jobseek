Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. No temporary fixes, no data repair, no migrations, no schema changes.

SURGICAL RULE
Change only the two approved lines of Harper's coach prompt text below, so the number comes from the same setting the code enforces. Do not change any other prompt wording, the cap value, the ignore behavior (ignoring stays with no replacement question), or anything else. Add no features.

CONTEXT
Batch A raised the gap-question cap in code to 25 (consultationConfig.roundSize / applicationQuestionLimit in src/lib/product-config/consultation.ts), but src/lib/prompt-content/consultation.ts still hardcodes 10, so Harper may stop asking at 10.

APPROVED CHANGE (src/lib/prompt-content/consultation.ts)
Replace the hardcoded 10 in these two lines with the value of applicationQuestionLimit from consultationConfig, read at prompt build time, keeping all other wording exactly:
- Line 17: "Across the whole application, including questions already asked, there are never more than {cap}."
- Line 35: "When every important gap is closed or confirmed and every question is answered, or {cap} questions have been asked, set questions to [] and write closingNote…" (keep the rest of the line exactly as it is).
If the prompt is a static string today, build it so the number is inserted from the setting; do not duplicate the number anywhere.

PROMPT VERSION
- Report the consultation prompt version constant and the repository's convention for changing prompt text (whether the version is bumped).
- Follow that convention.
- Report what a version change triggers: which fingerprints change, and whether anything regenerates automatically for existing applications. Nothing may regenerate on a page view. If bumping the version would automatically regenerate anything without a seeker action, STOP before bumping and report it for approval.

TESTS
Add or update automated tests that assert:
- The coach prompt text contains the cap value from consultationConfig in both lines, and no hardcoded 10 remains for the question limit.
- Changing the configured cap changes the number in the prompt.
- No page view triggers a consultation plan.
Run the full existing test suite, including real-Postgres tests, and confirm it passes with no new failures. Never change an existing test only to make it pass; report any test changed and why.

REPORT
1. The before and after text of both lines.
2. The prompt version handling and what it triggers.
3. Every file changed.
4. Tests added or changed and the full test suite result, confirming the real-Postgres tests ran.
5. Confirmation that nothing else changed.

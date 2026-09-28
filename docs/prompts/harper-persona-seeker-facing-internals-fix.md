# Prompt: Fix seeker-facing persona internals (role-cap messages + interview stage in Concerns)

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix each defect at its root cause, not by filtering or patching output downstream of where it is created, unless the root cause analysis shows the downstream point is the correct fix. No temporary fixes, no data repair, no migrations.

SURGICAL RULE
Change only what is needed to fix the two defects below. Do not remove or change any other functionality, text, UI, sections, prompts, or behavior. Do not add features. Persona wording comes from its prompts; do not rewrite model prompts unless the root cause is in a prompt, and if so, report it and stop before changing it.

CONTEXT
Seekers must only see end results, never internal limits, ids, or system mechanics. Two places on the general persona page violate this.

DEFECT 1: Internal role-cap messages shown to the seeker
On a built general persona, the "Why they were identified" section ends with text like:
"Channel Partnerships Leader: Exceeded the configured maximum of 8 roles. Finance Business Partner: Exceeded the configured maximum of 8 roles. Enterprise Risk and Security Stakeholder: Exceeded the configured maximum of 8 roles."
- Find where these messages are produced and how they reach persona content or seeker-facing UI.
- Fix so they never reach seeker-facing content or stored persona text.
- Do not change the role cap itself or how roles beyond the cap are handled. Keep any existing server-side logging of the cap unchanged.

DEFECT 2: Interview stage appearing inside Concerns
On a built general persona, the Concerns list includes an item like:
"Interview stage: hiring manager chronological walk-through"
- Determine the root cause: whether an interview stage field is being rendered into the Concerns list by code, or the model is placing it in the concerns output.
- If code: fix the structure so the value no longer appears in Concerns. If this value is already displayed elsewhere, leave that display as is. If it is displayed nowhere else, do not add a new UI section; report it.
- If the model output: do not change the prompt. Report the root cause and the exact prompt text involved, and stop for approval on this defect only.

TESTS
Add or update automated tests that assert:
- Role-cap messages never appear in stored general persona content or in any seeker-facing rendering, and the role cap behavior is unchanged.
- The interview stage value does not appear in the Concerns list (if fixed in code).
Run the full existing test suite and confirm it passes with no new failures.

REPORT
For each defect: root cause with file paths, function names, and line numbers; the exact change made; and anything left for approval. Then list the tests added or updated and the full test suite result. List every file changed. Confirm nothing outside these two defects was changed.

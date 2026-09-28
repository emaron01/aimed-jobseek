Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root cause. No temporary fixes, no data repair, no migrations, no schema changes unless reported and approved first.

SURGICAL RULE
Change only what is needed for the product owner rule below. Do not change prompt text, models, the job parse or scorecard content, the Phase 1 gate, serialization, or any UI. Add no features. If any step requires changing prompt text or adding schema, STOP before that step and report it for approval.

CONTEXT
The overnight report (docs/prompts/overnight-remaining-punch-list-report.md, Parts A and B) found:
- updateInterviewStageAction re-runs the job parse (interpretJobPosting) and scorecard when interview notes change.
- "Learned notes" are an input and trigger for the job parse and scorecard.
- Stage notesAfter (what the seeker learned in an interview) only changes a cheat-sheet fingerprint and never reaches the cheat-sheet prompt sources.
The Job Requirements page change (docs/prompts/job-requirements-page-remove-scorecard-regenerate-report.md) removed regenerateApplicationJobRequirementAction but kept the regenerate service because src/app/actions/interview.ts line 135 still calls it.

PRODUCT OWNER RULE
What the seeker learns (learned notes and interview stage notes, including notesAfter) is added to the job details used ONLY by cheat sheets. It never re-runs the job parse, scorecard, resume, cover letter, company research, or personas. A change to what the seeker learned is a real input change for cheat sheets, and only for cheat sheets.

STEP 1: REPORT FIRST (then continue unless a STOP applies)
List every field where the seeker records what they learned (learned notes, notesAfter, any other), where it is stored, every place it is read today (job parse inputs and triggers, scorecard, cheat-sheet sources, cheat-sheet fingerprints, anything else), and every trigger that fires when it changes, including the call at interview.ts line 135. Cite file and line.

STEP 2: IMPLEMENT
1. Stop learned notes and interview stage notes from re-running or feeding the job parse and scorecard: remove them from job parse inputs and triggers, including the call at interview.ts line 135 and wherever learned notes enqueue or run the parse. Keep every other job parse trigger (create or save posting) unchanged.
2. After step 1, if the job requirement regenerate service has no remaining caller, remove it so no path can run it. If it still has callers, keep it and report them.
3. Keep the existing cheat-sheet enqueue when interview notes change.
4. Feed what the seeker learned into the cheat-sheet sources the cheat-sheet generation actually reads (the shell and the per-person sections, as the code assembles them), through the existing source assembly. Do not change cheat-sheet prompt text; if the prompt cannot use the added source without a text change, STOP and report the exact text for approval.
5. Keep the cheat-sheet fingerprints consistent with the sources: a change to what the seeker learned changes the fingerprint of the cheat-sheet content that uses it, and nothing else.

TESTS
Add automated tests that assert:
- Updating interview stage notes or learned notes makes no job parse or scorecard call and enqueues no job parse.
- Updating them enqueues cheat-sheet generation as today.
- What the seeker learned appears in the sources passed to cheat-sheet generation.
- Unchanged learned notes and stage notes cause no new cheat-sheet paid call (existing hash skip still works).
- Creating or saving a posting still runs the job parse as before.
- If removed, the regenerate service no longer exists and nothing references it.
Run the full existing test suite, including real-Postgres tests, and confirm it passes with no new failures. Never change an existing test only to make it pass; report any test changed and why.

REPORT
1. STEP 1 findings.
2. What changed for each implementation step, with file and line.
3. Whether the regenerate service was removed or kept, and why.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test, and the full test suite result, confirming the real-Postgres tests ran.
6. Confirmation that no prompt text, schema, job parse content, or scorecard content changed, and nothing outside this scope changed.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

REPORT ONLY. Do not change any code, configuration, schema, prompts, or data.

TASK: Find every place product code writes, appends, rewrites, filters, or substitutes Harper's text or seeker-facing coaching text, instead of that text coming from Harper's prompts in src/lib/prompt-content/.

Search all Harper and cheat sheet code paths (consultation, polish, extract, coach, person prep, Where you stand, cheat sheet, next step, repair routines) for:
1. Fixed or templated strings shown as questions, follow-ups, notes, statements, closing notes, or coaching (for example, the appended "Which roles did that come from?").
2. Code that rewrites model text (voice changes, wording changes, regex replacements).
3. Code that filters, strips, or truncates text (for example, seekerWrittenReply), including anything applied to the seeker's own replies.
4. Fallback text shown when the model returns nothing or fails.
5. Checks that reject model output and what happens after (regenerate, substitute, drop, or fail).

For each one found, report:
- File and function.
- Exactly what it does, with the literal text or pattern.
- When it runs (new content, existing data repair, or both).
- Whether it can change or remove words the seeker actually wrote.
- Whether it is structural (limits, duplicate prevention, state, data assembly, saving) or content (words).

Also report:
- Every existing seeker reply in the production-shaped data that was changed by the recent repair, with before and after text, and whether the original is recoverable from stored history.
- Where coach-generated text entered a seeker reply in the first place, and whether that source is closed.

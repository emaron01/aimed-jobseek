SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below. Passes 2 and 3 of the approved plan come later; do not start them.

TASK: Pass 1 of the approved plan: protect the seeker's data. Implement sections 2a, 2b, 2c, 3a, and 3b of your plan, with the changes below. Work on main. Commit and push when all checks pass.

1. Replies stored exactly as typed (plan 2a)
- recordConsultationReply and editConsultationAnswer store the reply trimmed of surrounding whitespace only. An empty reply still returns the existing "write an answer or skip" error.
- repairExistingConsultationSession no longer updates or deletes seeker turns for voice, and no longer rewrites campaign.whyThisCompany.
- Remove seekerWrittenReply and its stripping patterns from all live code.
- Already-stripped replies cannot be restored (no history exists); leave them as they are. Do not add any new stripping.

2. "Not accurate" is a flag, not a seeker reply (plan 2b)
- Add a nullable ConsultationStatement.inaccuracyFlaggedAt column (migration safe on existing data; existing rows stay null).
- flagConsultationInaccuracy sets that column on the flagged statement and replans with the focus and the existing model-only guidance. It creates no seeker turn and never writes askForStory or any other product text as Harper or seeker words.
- Existing "Not accurate." seeker turns are hidden from the thread, not deleted.

3. Why-this-company motivation comes from Harper, not word-matching (plan 2c, changed)
- Do not use looksLikeCompanyMotivation, looksLikeWorkStory, or any other regex or keyword test. Delete them from live paths, including repair.
- Add a companyMotivation field to the extract output: when the target is why-this-company, Harper returns the part of the seeker's reply that states why they want to work at this company, in the seeker's own words, or null when the reply contains no motivation (for example, a work story only). Add this instruction to the extract prompt.
- persistWhyThisCompany saves companyMotivation to campaign.whyThisCompany and the why-this-company fact. When it is null, nothing is saved as motivation.
- Existing applications: re-run extract once on each existing why-this-company card's replies and persist companyMotivation, replacing any value saved from a work story.

4. Stop dropping what the seeker states (plan 3a)
- proposalsFromExtraction no longer drops facts or story parts as "ungrounded". Keep only structural drops: fragments, targets not on this job, and empty explanations.
- Confirm in the report that proposed facts still require the seeker's explicit confirmation before anything is written to the Personal Profile.

5. Delete dead validators (plan 3b)
- Delete validateCoachItems and validateSeekerVoice. Keep the cheat sheet structure helpers that are still used.

TESTS
- Replies and edits are saved exactly as typed, including text such as "He also reports..." or "the seeker".
- Repair never changes seeker turn bodies or campaign.whyThisCompany.
- Flagging "not accurate" sets inaccuracyFlaggedAt, creates no seeker turn, and legacy "Not accurate." turns are hidden.
- A why-this-company reply containing motivation saves only the motivation; a work-story-only reply saves nothing as motivation; no regex decides it.
- Existing why-this-company cards are re-extracted once and corrected.
- A paraphrased seeker-stated fact is not dropped; fragments and wrong-target items still are; confirmation is still required before profile writes.
- validateCoachItems and validateSeekerVoice no longer exist.

REPORT
What changed for each item, the migration, the result of re-extracting existing why-this-company cards (before and after values), files changed, and a full-suite result.

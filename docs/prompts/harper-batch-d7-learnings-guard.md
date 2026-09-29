Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Production-grade code only. Enforce by structure; no temporary fixes, no data repair, no migrations, no Prisma schema changes. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main. If anything unexpected happens, STOP and report.
SURGICAL RULE
Batch D7 only: learnings gated by fingerprint, learnings defaulting to the Hiring Manager, approved answers protected during reassess, and matched people inheriting their role, per section 7 of docs/prompts/harper-batch-d-methodology-plan-report.md, with the product owner's decisions below, which override the plan. Reuse the Phase 1 paid-call gate and serialization. Do not change tags, answer parts, career stage, recentRoles, or role-expertise (D2 to D6), except that reassess must respect them. Add no features.
PRODUCT OWNER DECISIONS
1. Learnings (learned notes, stage notes before and after, and newly gained information) apply to the Hiring Manager by default, including the matched Hiring Manager person when there is one; for other interviewers they are background only in Harper's coaching.
2. Reassess runs only when the learnings actually change: a fingerprint of the learnings under the Phase 1 gate pattern. Unchanged learnings trigger no reassess and no paid call. It stays serialized and never runs on a page view.
3. Reassess is additive: it may add new gap questions, including beyond 25 (the cap applies to the initial coaching set only). It never changes, replaces, or deletes an answered question or an APPROVED statement, and never removes role-expertise questions.
4. Cheat Sheet cost guard: learnings feed the Hiring Manager's Cheat Sheet section, plus wherever they already feed today, and no additional person sections, so one note does not rebuild every section.
5. A matched person inherits their role: there is rarely enough information to build a profile of a person on their own, so a person is any usable data from their pasted LinkedIn plus everything from the Hiring Team role they are matched to (that role's general persona). This applies to every matched person. The matched Hiring Manager person also receives the learnings (decision 1). The role's persona and the person's own details stay separate records (never merged into one record), but everything that uses a person (Harper's coaching and person prep, Harper's person view, the Cheat Sheet person section) uses both.
IMPLEMENT
1. Learnings fingerprint: canonical payload of seekerLearnedNotes, each stage's id, notesBefore, and notesAfter, the newly gained information (cheatSheetNotesJson entries), and the consultation prompt version. New PaidCallOperation CONSULTATION_LEARNINGS_REASSESS, subjectKey campaignId. Every place that enqueues a learnings reassess today (saveApplicationJobLearnedNotes, updateInterviewStageAction, addCheatSheetInterviewNote, and any other; report each with file and line) enqueues only when the fingerprint differs from the last recorded one, and records it once the reassess succeeds.
2. Harper coach prompt (src/lib/prompt-content/consultation.ts): replace the Hiring Team sentence about person details with exactly:
Hiring Team: each role carries generalPersona, the built persona for the role itself, and people, the individuals matched to that role. These are separate entries and stay separate: a person's own persona and LinkedIn details describe that individual only. Never merge a person into the generalPersona, never treat one person as standing for the role, and never apply one person's private details to another. What the seeker learned during the interview process (learned notes, notes before and after each interview, and newly gained information) applies to the Hiring Manager by default, including the matched Hiring Manager person when there is one; for other interviewers, use it only as background.
Change no other wording. Report the before text. Bump CONSULTATION_PROMPT_VERSION per convention and report what it triggers.
3. Hiring Manager routing: identify the Hiring Manager role and person (existing HIRING_MANAGER_KEY and section-kind logic). Pass learnings to Harper's coach attached to the Hiring Manager, and as background for others. If no Hiring Manager exists yet, learnings stay on the application and apply to the Hiring Manager role once it exists, with no rewrite of approved answers.
4. Cheat Sheet: learnings feed the Hiring Manager's person section per decision 4. Report every person section that received learnings before and after this change.
5. Additive locks: in the reassess path, never update or delete an answered question, an APPROVED statement, or a role-expertise question; only add. Report exactly where the lock is enforced.
6. Role inheritance (decision 5): report, with file and line, what each consumer of a person receives today (Harper coach payload and person prep, Harper's person view, Cheat Sheet person section generation and its sources): the person's LinkedIn-derived details, their matched role's general persona, and (for the Hiring Manager person) the learnings. Where any consumer does not receive the matched role's general persona, fix it at the root so it does, without merging the records. A person with no LinkedIn data still gets a complete profile from their role. Report what changed and whether it changes any fingerprint (a role persona change is a real input change for that person's content).
TESTS
Add automated tests that assert:
- Saving unchanged learnings (learned notes, stage notes, or newly gained information) enqueues no reassess and makes no paid call.
- A real learnings change enqueues exactly one serialized reassess.
- The reassess adds new gap questions (including beyond 25) and never changes or deletes an answered question, an APPROVED statement, or a role-expertise question.
- Learnings reach Harper's coach attached to the Hiring Manager, and as background for other interviewers.
- With no Hiring Manager yet, learnings stay on the application and apply once one exists.
- A learnings change rebuilds only the Hiring Manager's Cheat Sheet section plus sections that already used learnings, not every section.
- A matched person with no LinkedIn data receives their role's general persona in Harper's coach payload, person prep, Harper's person view, and Cheat Sheet generation; a person with LinkedIn data receives both, as separate entries; the matched Hiring Manager person also receives the learnings.
- The coach prompt contains the exact new sentence.
- Nothing runs on a page view.
Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.
COMMIT
After everything passes, update checkpoint/harper-prep-hub from main (merge, not reset), commit with a message naming Harper Batch D7, and push that branch. Do not merge into main or push main.
REPORT
1. Every learnings enqueue point, and the fingerprint inputs.
2. The coach prompt sentence (before and after) and the version bump with what it triggers.
3. Hiring Manager routing, including the no-Hiring-Manager case.
4. Cheat Sheet sections receiving learnings, before and after.
5. Where the additive locks are enforced.
6. Role inheritance: what each consumer received before, what changed, and any fingerprint effect.
7. Every file changed.
8. Tests added or changed, with reasons for any changed existing test; the test suite, build, type check, and lint results.
9. The commit hash and branch pushed.
10. Confirmation that no git command discarded work and nothing outside D7 changed.

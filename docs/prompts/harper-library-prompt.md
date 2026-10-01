Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. No new tables, no new paid services (no embeddings, no comparison model), no data repair, no migrations or schema changes unless reported and approved first. The only prompt text change allowed is the approved sentence below. Every paid call goes through the existing paid-call gate where it does today; nothing makes a paid call or enqueues a job on a page view; nothing regenerates when inputs are unchanged; writing stays on the writing model. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub or any other in-progress branch. Create a new branch from main named fix/harper-library. If main does not include 320d112 (sidebar current step), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Build only the Harper library below, per section G of docs/prompts/cheat-sheet-batch-2-plan-report.md, with the product owner's decisions below overriding the plan where they differ. No seeker-facing screen. Change nothing else. Add no features.

PRODUCT OWNER DECISIONS
1. The library is behind the scenes. When a new application asks a question similar to one the seeker approved an answer for in a past application, Harper starts from that approved answer and tailors it to the new company and role, instead of writing from scratch.
2. Source pool: APPROVED INTERVIEW_ANSWER ConsultationStatements in the same organization, from other applications (campaigns). The text used is the statement's current content (so an in-place edit wins).
3. Matching: the same interview-type tag when both questions have one, and the question text is a near duplicate. Reuse the matching helper built for the Cheat Sheet (interviewerQuestionMatchesGeneral and questionTextNearDuplicate in src/lib/consultation/general-question-match.ts, which already ignores intent-class-only matches). Every question kind is eligible, including "Why this company". With several matches, use the most recently approved.
4. The result is always a DRAFT for the seeker to review and approve. Nothing is approved automatically.
5. Add exactly this text to the role-expertise answers instructions (ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS) and to Harper's polish instructions:
When a prior approved answer is supplied, tailor it to this company and role. Replace anything about the previous company with this company's information; never carry it over. Do not add employers, numbers, titles, or outcomes that are not in the supplied answer or the Personal Profile.
Change no other wording. Bump each affected prompt version per convention and report exactly what each bump triggers (including any paid reassess on the seeker's next action), and confirm nothing regenerates on a page view.

IMPLEMENT
1. A library lookup (organization-scoped, excluding the current application) that returns the best match for a question per decisions 2 and 3, or none, with no provider call.
2. Role-expertise answers step (writing model, ROLE_EXPERTISE_ANSWERS): for each chosen question with a match, pass the prior approved answer, its question, and its statement id as source material. Include the matched statement id and a hash of its content (or an explicit empty match) in roleExpertiseAnswersFingerprint. Confirm storeRoleExpertiseQuestions never inserts a second turn for an existing targetKey, and that applications that already have their role-expertise questions do not re-run because of this change.
3. Polish (writing model): when the seeker replies to a question that has a match, include the prior approved answer as source material, alongside the seeker's replies (the seeker's replies take precedence where they differ). Only when the seeker has replied; never on a page view.
4. Report which question kinds now get library help and when, and propose (do not build) how library-seeded suggested answers could appear for questions that have no suggested-answer step today (for example "Why this company" and gap questions), with cost.
5. Confirm the full account wipe removes every library source (statements cascade with the organization) and that one organization's answers are never used for another.

TESTS
Add automated tests that assert:
- The lookup returns an approved answer from another application in the same organization for a question with the same tag and near-duplicate text, returns the most recently approved when several match, ignores intent-class-only matches, excludes the current application, and never returns another organization's answers.
- The role-expertise answers step passes the matched answer as source material through runPaidStructuredCall ROLE_EXPERTISE_ANSWERS; a second run with the same questions and unchanged source content makes no provider call; changing the source content changes the fingerprint.
- Polish receives the matched prior answer only when the seeker has replied, with the seeker's replies taking precedence.
- Every library-based result is stored as a DRAFT, never APPROVED.
- Both instructions contain the exact approved text.
- After wipeOrganizationAccount, the lookup returns nothing from the wiped organization.
- No page render makes a paid call or enqueues a job, and applications with existing role-expertise questions do not re-run.
Run the worker boundary test (--conditions=react-server). Run npm test (default parallelism, including real-Postgres tests), plus the exact production build, the full type check, and lint. All must pass with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/harper-library with a message naming the Harper library, and push that branch. Do not merge into main or push main.

REPORT
1. The lookup, matching, and precedence rules, with file and line.
2. How the role-expertise answers step and polish use the library, the fingerprint change, and confirmation existing applications do not re-run.
3. The instructions before and after, the version bumps, and exactly what each triggers.
4. Which question kinds get library help, and the proposal for the rest, with cost.
5. The wipe and organization-scoping confirmation.
6. Every file changed.
7. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
8. The commit hash and branch pushed.
9. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside the library changed.

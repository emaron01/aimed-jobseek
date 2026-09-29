SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Enforce by structure; no temporary fixes, no data repair, no migrations, no Prisma schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main. If anything unexpected happens, STOP and report.

SURGICAL RULE
Batch D2 only: WHO interview-type tags on Harper coach questions (gap questions, why this company, career walk-through, and person prep), per section 3 of docs/prompts/harper-batch-d-methodology-plan-report.md, with the product owner's changes below, which override the plan. Do not change the Cheat Sheet or interview guide generators (Batch D4), answers or answer parts (D3), career stage (D5), role-expertise (D6), or learnings (D7). No tag, method name, or label is ever shown to the seeker. Add no features.

PRODUCT OWNER CHANGES TO THE PLAN
1. The tag set is WHO's interview types only: screening, chronological_walk_through, focused_competency, reference_check_prep. Do not use why_this_company, role_expertise, or interviewer_prep as tags; the topic already lives in targetKey.
2. Where the topic decides the tag, the server sets it deterministically after the model returns, with no regeneration: targetKey chronology (or looksLikeCareerWalkThrough) is chronological_walk_through; the why-this-company target is screening. For every other question the model chooses the tag.
3. A missing or unknown tag fails schema validation and goes through the existing bounded quality regeneration (qualityRegenerationAttempts).

IMPLEMENT
1. consultationPlanSchema (src/lib/consultation/contract.ts): add required interviewTypeTag with the four values.
2. Coach prompt (src/lib/prompt-content/consultation.ts): add this line to the Questions block, exactly:
- Every question includes interviewTypeTag, one of: screening, chronological_walk_through, focused_competency, reference_check_prep. Use chronological_walk_through only for the career walk-through question; screening for broad fit and motivation questions such as why this company; focused_competency for a specific requirement or gap; reference_check_prep for what a former manager or colleague would confirm.
Change no other wording. Bump CONSULTATION_PROMPT_VERSION per convention and report what the bump triggers.
3. Deterministic overrides per change 2, in the server planning path (planQuestionRound or where planned questions are finalized).
4. Store the tag on the consultant turn in questionContextJson. Questions stored before this change have no tag; treat a missing tag as focused_competency for ordering only, with no data repair.
5. Invisible ordering: within each interviewer section and each topic that holds more than one question, order questions by WHO sequence: screening, then chronological_walk_through, then focused_competency, then reference_check_prep, keeping existing order within the same tag. Do not change which section or topic a question belongs to.
6. Confirm no Harper or Cheat Sheet component renders the tag or any method name.

TESTS
Add automated tests that assert:
- A plan output without interviewTypeTag or with an unknown value fails validation and triggers the bounded regeneration.
- The career walk-through is always stored as chronological_walk_through and why this company as screening, even if the model returns a different tag.
- The tag is stored in questionContextJson on the consultant turn.
- Questions within an interviewer section are ordered screening, chronological_walk_through, focused_competency, then reference_check_prep; an untagged older question sorts as focused_competency.
- No rendered Harper or Cheat Sheet output contains a tag value or method name.
- Rendering enqueues no job and makes no paid call.
Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, update checkpoint/harper-prep-hub from main (merge, not reset), commit with a message naming Harper Batch D2, and push that branch. Do not merge into main or push main.

REPORT
1. The schema change, prompt line (before and after), and version bump with what it triggers.
2. Where the deterministic overrides run, with file and line.
3. How the tag is stored and how ordering is applied.
4. Confirmation no tag or method name renders.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that no git command discarded work and nothing outside D2 changed.

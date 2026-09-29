Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Deterministic and derived only from the Personal Profile; no model call to decide career stage, no new seeker input, no temporary fixes, no data repair, no migrations, no Prisma schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main. If anything unexpected happens, STOP and report.

SURGICAL RULE
Batch D5 only: derive career stage from the Personal Profile and pass it to Harper's coach, polish, and Cheat Sheet person guidance, per section 5 of docs/prompts/harper-batch-d-methodology-plan-report.md, with the product owner's changes below, which override the plan. Do not change tags (D2), answer parts (D3, D4), role-expertise (D6), or learnings (D7). Career stage is never shown to the seeker. Add no features.

PRODUCT OWNER CHANGES TO THE PLAN
1. Years of experience decide the stage; role count is only a fallback when dates cannot be read. Never combine them with "or" so that a long career with few roles is classed as early career.
2. Thresholds (a loose guide, based only on what the profile shows):
   - new_to_workforce: no roles other than internships, part-time, student, volunteer, or trainee roles.
   - college_graduate: under 3 years of experience, with education in the profile. Under 3 years with no education listed is early_career.
   - early_career: 3 to under 8 years.
   - mid_career: 8 to under 15 years.
   - late_career: 15 years or more.
   Years come from parsed experience dates (overlapping roles are not double-counted). When dates cannot be parsed, fall back to role count: 0 qualifying roles is new_to_workforce, 1 to 2 early_career, 3 to 5 mid_career, 6 or more late_career. Never invent years.
3. Be loose: when the profile is ambiguous, choose the stage the clearest evidence supports; never block anything on career stage.

IMPLEMENT
1. deriveCareerStage(profile) as a pure function, with the thresholds above.
2. Pass careerStage in the structured payload (not seeker-facing) to the Harper coach plan, Harper polish, and Cheat Sheet person guidance generation.
3. Harper coach prompt (src/lib/prompt-content/consultation.ts), add to the Questions block exactly:
- Match careerStage: for new_to_workforce or college_graduate, ask about school, internships, projects, part-time work, and activities when the profile has them; for early_career through late_career, ask about roles and results at the level of this job.
4. Harper polish instructions (same file) and Cheat Sheet guidance prompt (src/lib/prompt-content/application-summary.ts), add exactly:
Draw examples that fit careerStage: for new_to_workforce or college_graduate, school, internships, projects, part-time work, and activities; for early_career through late_career, roles and results at the level of this job.
Change no other wording. Bump CONSULTATION_PROMPT_VERSION and APPLICATION_SUMMARY_PROMPT_VERSION per convention and report what each bump triggers.
5. careerStage must be included in the inputs that fingerprint these calls (so a real profile change that moves the stage is a real input change), and a profile change that does not move the stage adds no new fingerprint difference by itself. Report how.
6. Confirm careerStage is never rendered.

TESTS
Add automated tests that assert:
- deriveCareerStage returns: new_to_workforce for a profile with only internships and a class project; college_graduate for a new graduate with a degree and 1 year of work; early_career for 5 years; mid_career for 10 years; late_career for 25 years with only 4 roles (years decide, not role count); the role-count fallback when dates cannot be parsed; no double-counting of overlapping roles.
- careerStage reaches the coach, polish, and Cheat Sheet payloads.
- Each prompt contains the exact new text.
- careerStage is never rendered.
- Rendering enqueues no job and makes no paid call.
Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, update checkpoint/harper-prep-hub from main (merge, not reset), commit with a message naming Harper Batch D5, and push that branch. Do not merge into main or push main.

REPORT
1. deriveCareerStage rules as implemented, with file and line.
2. Where careerStage enters each payload and fingerprint.
3. Prompt text added and version bumps with what they trigger.
4. Confirmation careerStage never renders.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that no git command discarded work and nothing outside D5 changed.

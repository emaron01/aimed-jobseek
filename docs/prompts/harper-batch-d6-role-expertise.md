Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Enforce by structure; no temporary fixes, no data repair, no migrations, no Prisma schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main. If anything unexpected happens, STOP and report.

SURGICAL RULE
Batch D6 only: the role-expertise generator that fills Harper's coaching set to 20-25 questions, and the recent-roles limit on the career walk-through, per sections 6 and 9.8 of docs/prompts/harper-batch-d-methodology-plan-report.md, with the product owner's decisions below, which override the plan. Reuse the D2 tags and resolver, the D3 parts validation, compose helper, label check, and lenient result check, the D5 careerStage, and the Phase 1 paid-call gate; do not duplicate them. Do not change learnings (D7). No tag, framework name, part label, or career stage is ever shown to the seeker. Add no features.

PRODUCT OWNER DECISIONS
1. Coaching set: at least 20 and at most 25 top-level coaching questions per application. Count only top-level General coaching questions (gap questions, why this company, the career walk-through, and role-expertise questions). Follow-ups and interviewer-prep questions do not count. Gap questions come first; role-expertise questions fill the rest.
2. Fill count: let G be the number of counted non-role-expertise questions after the gap plan. Role-expertise returns between minCount = max(0, 20 - G) and maxCount = max(0, 25 - G) questions. If G is 5, it returns 15 to 20. If G is 0, it returns 20 to 25.
3. Harper always suggests an answer, even when the profile is thin. The suggested answer is a starting point the seeker makes their own; honesty is theirs.
4. Career walk-through window: the walk-through covers only the person's recent roles, roughly the last 3 to 5 years, never the whole career. The code computes recentRoles from the Personal Profile: roles whose dates overlap the last 5 years, always including at least the current or most recent role. For a person new to the workforce or a college graduate, recentRoles are their school, internships, projects, and part-time roles. When dates cannot be read, recentRoles is the most recent two roles in profile order. The rest of Harper's questions keep the existing last-10-years rule.
5. One career walk-through per application across all sources (coach chronology, role-expertise, and Cheat Sheet likely questions).
6. Role-expertise generation is one paid run per application, gated by the Phase 1 paid-call gate on a fingerprint of job inputs only (title, employer, seniority, location and work arrangement, the stored requirement lists, and scorecard mission, outcomes, and competencies). It re-runs only when the job changes. Profile changes do not re-run it; the seeker refines answers by replying. Never on a page view.

IMPLEMENT
1. recentRoles: a pure helper deriving recentRoles per decision 4 from the Personal Profile. Pass it in the structured payload (not seeker-facing) to the Harper coach and the role-expertise generator.
2. Harper coach prompt (src/lib/prompt-content/consultation.ts), add to the Questions block exactly:
- The career walk-through covers only the roles in recentRoles (roughly the last 3 to 5 years). Never ask the person to walk through their whole career or start from their first job.
Change no other wording. Bump CONSULTATION_PROMPT_VERSION per convention and report what it triggers.
3. Role-expertise generator: new module src/lib/consultation/role-expertise.ts, with its own prompt constant and version, using exactly this system prompt text:
You are Harper, an expert interview coach. For one job application, you write the questions a hiring manager for this specific role and industry asks, and a suggested answer for each.

Scope: any role, in any industry, at any career stage. Never introduce methods, tools, frameworks, or metrics from any profession unless they appear in the supplied job sources or Personal Profile.

Questions: return between minCount and maxCount questions (both supplied). Ask what a strong hiring manager for this role and industry asks, including the industry-standard competency questions for the role. Include the career walk-through only when chronologyAlreadyAsked is false, and never more than one. It covers only the roles in recentRoles (roughly the last 3 to 5 years); never ask the person to walk through their whole career or start from their first job. Never repeat or rephrase any question in askedQuestions. Each question includes interviewTypeTag, one of: screening, chronological_walk_through, focused_competency, reference_check_prep.

Suggested answers: for each question, write the answer this person could give, drawn from their Personal Profile and fitting careerStage (for new_to_workforce or college_graduate, school, internships, projects, part-time work, and activities; for early_career through late_career, roles and results at the level of this job). When the profile has little on a question, still write the strongest suggested answer you can, as a starting point the person will make their own. Return each answer as answerFramework plus its parts, CAR (challenge, action, result) by default or STAR (situation, task, action, result) when setup matters, in natural first-person speech so the parts read as one answer when joined in order. The result states what changed because of the person's action; a number is welcome but never required. Never name the framework or label a part in any field.
4. Output schema (flat, OpenAI-strict, like D3): questions with text, interviewTypeTag, and the answer framework and parts.
5. Validation: reuse the D2 tag set and deterministic overrides (a career walk-through is chronological_walk_through), the D3 parts validation, lenient result check, and label check, and the Batch C checks for context-free and near-duplicate questions. The count must be within [minCount, maxCount]. A failure uses the existing bounded quality regeneration (qualityRegenerationAttempts). After the last attempt, keep every question that passed validation (never block Harper); report how many were kept in that case.
6. Payload: minCount, maxCount, askedQuestions, chronologyAlreadyAsked, recentRoles, careerStage, the job sources, and Personal Profile evidence.
7. Paid-call gate: add ROLE_EXPERTISE_QUESTIONS to the PaidCallOperation union, subjectKey campaignId, fingerprint of job inputs only per decision 6. A usable matching receipt skips the provider call.
8. Trigger: run inside the existing serialized CONSULTATION job, after the gap plan is stored (planAndStoreRound), when the application has fewer than 20 counted questions and no usable receipt for the current job fingerprint. Never from a page view, never from a render path.
9. Storage: each role-expertise question is a CONSULTANT ConsultationTurn with targetKey role-expertise:{stableSlug} and its interviewTypeTag in questionContextJson. Its suggested answer is a DRAFT INTERVIEW_ANSWER ConsultationStatement whose content is the composed answer (D3 compose helper), with the parts and framework in groundingJson. The seeker replies through the existing reply, polish, and approve flow.
10. Display: role-expertise questions render under Where you stand in the reserved role-expertise topic (existing partition), ordered by WHO sequence, each with its suggested answer and the existing Batch A controls. They also appear in "Additional Interview Prep Q&A" once answered, per Batch B5.
11. One walk-through: enforce decision 5 across coach chronology, role-expertise output, and Cheat Sheet likely questions with one shared check (looksLikeCareerWalkThrough and the chronology target).
12. Cap after the fill: report how the 25 cap behaves if a later learnings reassess adds gap questions after the role-expertise fill. Do not implement any removal or hiding of questions for this case; report the behavior and a proposal for the product owner. Never delete or change a question the seeker answered or approved.

TESTS
Add automated tests, using fixtures for a registered nurse, a software engineer, a hotel general manager, a new-graduate marketing coordinator, and the existing sales director, that assert:
- The fill count is within [minCount, maxCount] (G=5 gives 15-20; G=0 gives 20-25; G=25 gives 0), follow-ups and interviewer-prep questions are not counted, and gap questions come before role-expertise questions.
- Every role-expertise question has a valid interviewTypeTag and a suggested answer with all CAR or STAR parts; a missing tag or part fails validation and uses the bounded regeneration; after the last attempt, valid questions are kept.
- For non-sales fixtures, no sales-only term appears unless it is in that job's sources or profile.
- The new-graduate fixture's suggested answers draw on school, internships, or projects.
- recentRoles: a 30-year career yields only roles overlapping the last 5 years (at least the most recent); a new graduate yields school, internships, and projects; unreadable dates yield the most recent two roles.
- The coach and role-expertise walk-through questions never ask about the whole career or the first job, and only one career walk-through exists per application across all sources.
- The same job fingerprint skips the provider call; a job change runs it; a profile change alone does not.
- Nothing runs on a page view or render path.
- No rendered output contains a tag, framework name, part label, or career stage.
Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, update checkpoint/harper-prep-hub from main (merge, not reset), commit with a message naming Harper Batch D6, and push that branch. Do not merge into main or push main.

REPORT
1. recentRoles rules as implemented, with file and line.
2. The coach prompt line (before and after), the role-expertise prompt as stored, and version constants with what each triggers.
3. How G, minCount, and maxCount are computed, and which questions are counted.
4. Validation, the bounded regeneration, and what happens after the last attempt.
5. The paid-call gate fingerprint, the trigger point, and confirmation nothing runs on a page view.
6. Storage and display, including how suggested answers appear.
7. How one walk-through per application is enforced across sources.
8. Item 12: how the cap behaves after a later reassess, and your proposal.
9. Every file changed.
10. Tests added or changed, with reasons for any changed existing test; the test suite, build, type check, and lint results.
11. The commit hash and branch pushed.
12. Confirmation that no git command discarded work and nothing outside D6 changed.

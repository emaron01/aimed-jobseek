Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Use the existing AI provider configuration (the consultation provider for planning and judgment, and the consultation reply provider for writing); do not add new environment variables. No temporary fixes, no data repair, no migrations, no schema changes, no prompt wording changes beyond splitting the role-expertise prompt as described (report the exact before and after text). Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub. Create a new branch from main named fix/harper-model-split. If main does not yet include f517b30 (the Harper reply chain work), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Do only the three parts below. Change nothing else. Add no features.

PRODUCT OWNER RULE
The planning model (gpt-5.6-terra, the consultation provider) does thinking and judgment: choosing questions, assessing fit, planning. The writing model (gpt-5.6-luna, the consultation reply provider) does writing: answers, drafts, and long text. The product owner has already compared writing quality between the two and found almost no difference.

PART 1: Split role-expertise
Today one call on the consultation provider both chooses the role-expertise questions and writes a suggested answer (CAR or STAR parts) for each.
- Step A, questions (consultation provider, terra): choose the role-expertise questions with their interviewTypeTag, under the same rules as today (count between minCount and maxCount, one career walk-through at most, recentRoles, no repeats of asked questions, role-agnostic, career stage).
- Step B, suggested answers (consultation reply provider, luna): write the suggested answer for each chosen question, with the same rules as today (drawn from the Personal Profile, fitting careerStage, CAR by default or STAR where setup matters, the result states an outcome, no invented facts, keep every number, fraction, percentage, date, company, and name exactly as stated, no framework names or part labels).
- Split the existing role-expertise prompt into the two steps without changing the meaning of any rule; report the exact before and after text.
- Keep all existing behavior: the D2 tag rules, D3 parts validation and bounded regeneration (applied to each step as appropriate), the D4 and D6 dedupe and one-walk-through rules, storage (questions as consultant turns, suggested answers as DRAFT statements), display, and the Phase 1 paid-call gate: the questions step is keyed on the job fingerprint as today; the answers step runs once for a newly chosen question set and is not re-run by profile changes alone.
- Report the expected change in cost for one role-expertise run.

PART 2: Audit every other paid step (report only; no changes)
For every paid AI call in the product (Harper plan, reassess, extract, polish, statement regeneration, role-expertise, Cheat Sheet shell and person guidance, resume, cover letter, presentation plan, claim validation, outreach, thank-you and check-in, contact profile, company research, persona identify and synthesis, job parse, next step, and any other), report: which provider or model setting it uses, whether its work is thinking and judgment or writing, and flag every writing step that runs on terra or another larger model. Make no changes for this part.

PART 3: Record the step and attempt on every Harper call
For every Harper usage event (operations CONSULTATION and CONSULTATION_REPLY), record in the existing UsageEvent metadata field: step (one of plan, reassess, role_expertise_questions, role_expertise_answers, extract, polish, statement_regeneration, or another named step you find) and attempt (1 for the first call, 2 and 3 for quality regenerations). No schema change. Give the product owner the exact read-only SQL to break down Harper cost for one application by step, model, and attempt using this metadata.

TESTS
Add automated tests that assert:
- The role-expertise questions step uses the consultation provider and the answers step uses the consultation reply provider.
- The questions and answers produced still satisfy every existing rule (count range, tags, one walk-through, parts, lenient result, no labels, facts kept exactly), and existing role-expertise tests still pass.
- The questions step is skipped when the job fingerprint is unchanged; a profile change alone does not re-run either step; a new question set gets its answers generated once.
- Every Harper usage event records step and attempt in metadata, including regeneration attempts.
- Nothing runs on a page view.
Run the worker boundary test (--conditions=react-server). Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors. If the known load flake in paid-call-advisory-lock.test.ts ("different subjects run in parallel") fails under the full suite, re-run it alone and report it; any other failure must be fixed. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/harper-model-split with a message naming the role-expertise model split and Harper usage step recording, and push that branch. Do not merge into main or push main.

REPORT
1. PART 1: the split, which provider each step uses, the role-expertise prompt text before and after, the gating behavior, and the expected cost change, with file and line.
2. PART 2: the full audit table, with every writing step on a larger model flagged.
3. PART 3: the metadata recorded, with file and line, and the read-only SQL for a per-step, per-model, per-attempt breakdown.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; flakes by name; the worker boundary test result; the test suite, build, type check, and lint results.
6. The commit hash and branch pushed.
7. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside these three parts changed.

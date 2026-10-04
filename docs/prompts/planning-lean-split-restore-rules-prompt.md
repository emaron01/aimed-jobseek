Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. The product owner approves adding every uncovered rule from today's coach instructions (src/lib/prompt-content/consultation.ts) back into the lean split, verbatim, as listed in section 2 of the feat/planning-lean-split report, assigned as below. No other instruction wording may be added, removed, or reworded. No schema changes or data repair. Every paid call stays behind the paid-call gate. Nothing runs on a page view or reruns on its own. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do NOT use C:/Repos/aimed-jobseek (it is on an old branch). Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1. Work in C:/Repos/aimed-jobseek-planning-lean-split on feat/planning-lean-split (at 66836db), committing on top of it. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the items below. Do not merge into main or push main. Change nothing else. Add no features.

ITEM 1: Restore the uncovered rules, verbatim
Take every rule your report listed as "in today's coach and in neither approved text" and add each one, with its exact current wording (adjusting only {cap} and field names that differ between the two schemas, and reporting each such adjustment), to the decision instructions (terra), the writing instructions (luna), or both, by this principle:
- Decision (terra) gets rules about judging and asking: who Harper is and coaching rather than interrogating; scope (no frameworks, tools, or metrics from other professions unless in the profile or job sources); sources (the Personal Profile is true, re-evaluate when it changes, how to use companyResearch, never mention research status); semantic assessment across the whole profile, including adjacent and transferable experience; never lowering a STRONG or PARTIAL rating because new support arrived; interview-type tag meanings (screening, focused_competency, reference_check_prep, and the walk-through); the 10-year rule for every question; the recentRoles walk-through scope; vague or buzzword requirements asked as concrete behavior; never asking about STRONG targets or targets met from dates; the why-this-company question; PARTIAL gaps stating what is supported and asking only for the missing piece; never asking for months or estimates on years-of-experience requirements; a seeker-stated background fact not tied to roles asking which roles it came from; interviewer details (linkedIn, headline, About, roles, profileText) describing the interviewer and never being cited as the seeker's evidence or used in a question as the seeker's history; Hiring Team people and generalPersona staying separate when choosing a question's Hiring Team role; when every gap is closed or the cap is reached, returning no questions; if qualityFeedback says the result was not accurate, asking what is wrong; if qualityFeedback names a field, changing only that field.
- Writing (luna) gets rules about prose and citations: who Harper is and coaching rather than interrogating; never referring to the person in third person by name or as he, she, or the seeker; FACT-only citations, never an INFERENCE item, never an id or id list in any prose field, naming employers, titles, and outcomes in plain language, achievement items carrying their parent roleId for citation only; for years-of-experience requirements, listing in relevantRoleIds only the FACT roles where the skill was used; never leaving importantGaps empty; storyPlan is []; requirementInterpretation set to the concrete meaning for vague requirements; whoCaresNote required on every question and never empty; the full Hiring Team rules for whoCaresNote (generalPersona and people kept separate, naming which is which, learned notes applying to the Hiring Manager by default, null generalPersona handled from the role name and titles, no claims when a person has no linkedIn); interviewer details never being the seeker's experience; likelyToValue connecting the seeker's own experience to what that interviewer values, with the example sentence, and saying nothing when it is empty; closingNote written as coaching when gaps are closed or the cap is reached, otherwise null; interviewer prep, closing notes, and commentary as coaching, never called a question plan or referring to plan status; not using the words "Harper prepares the seeker"; interviewer-prep commentary grounded in that person's entry, persona, LinkedIn, notes, invitation, stages, and learnings alongside the role's generalPersona; never generic and never an instruction to go find or prepare something; not writing a resume, cover letter, or outreach; never mentioning research status, confidence, missing data, prompts, models, or internal state; if qualityFeedback names a field, rewriting only that field.
- If a listed rule fits both, put it in both. If a listed rule does not fit this principle, STOP and report it rather than placing it.
ITEM 2: Versions. Bump CONSULTATION_PLAN_DECISION_PROMPT_VERSION and CONSULTATION_PLAN_WRITING_PROMPT_VERSION to "2". Report what that triggers: nothing reruns on its own or on a page view.
ITEM 3: Print the complete final decision and writing instruction texts in the report, so the product owner can review them in full.

TESTS
Add or update automated tests that assert every restored rule appears verbatim (with only the reported adjustments) in the instructions it was assigned to, the versions are "2", and every assertion in planning-lean-split.test.ts still holds. Run npm test (default parallelism, including real-Postgres tests; database up, not in parallel with the build), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, in the worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on feat/planning-lean-split with a message naming the restored coaching rules, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1: where each restored rule went (decision, writing, or both), any wording adjustment, and any rule you stopped on.
2. ITEM 2: the versions and what they trigger.
3. ITEM 3: the complete final decision and writing instruction texts.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
6. The commit hash, branch, and worktree path.
7. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these items changed.

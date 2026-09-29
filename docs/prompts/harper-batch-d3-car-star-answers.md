Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Enforce by structure; no temporary fixes, no data repair, no migrations, no Prisma schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main. If anything unexpected happens, STOP and report.

SURGICAL RULE
Batch D3 only: Harper polished interview answers built in CAR or STAR parts, per section 4 of docs/prompts/harper-batch-d-methodology-plan-report.md, with the product owner's changes below, which override the plan. Do not change the Cheat Sheet or interview guide generators (D4), career stage (D5), role-expertise (D6), learnings (D7), resume bullets, extract, or tags (D2). No framework name or part label is ever shown to the seeker. Add no features.

PRODUCT OWNER CHANGES TO THE PLAN
1. The result check is lenient: the result must be present, non-empty, and state what changed or what happened because of the person's action. It never requires a number or metric (results in nursing, hospitality, teaching, and early-career work are often qualitative). Do not reject a result for lacking a number.
2. Keep qualityRegenerationAttempts at its current value (2).
3. Exceptions keep a single composed answer with no parts: whyThisCompany answers and confirmedGap honest talk tracks. Resume bullets are unchanged.

IMPLEMENT
1. consultationPolishSchema (src/lib/consultation/contract.ts): for the non-exception case, return answerFramework ("CAR" or "STAR") and the parts for that framework as separate required fields (challenge, action, result for CAR; situation, task, action, result for STAR), alongside resumeBullet and strengtheningNote as today. Keep the exception cases returning a single interviewAnswer.
2. Polish prompt (src/lib/prompt-content/consultation.ts): replace the non-exception interview-answer instruction with exactly this text, keeping the resume bullet line and everything else unchanged:
When confirmedGap is false and whyThisCompany is false: turn the person's answers into interview answer parts and one resume bullet.
- Interview answer parts: choose answerFramework "CAR" (challenge, action, result) by default, or "STAR" (situation, task, action, result) only when the answer needs distinct setup and responsibility to make sense. Return each part as its own field, in natural first-person speech the way a confident professional says it aloud, so the parts read as one answer when joined in order. The result states what changed because of the person's action; a number is welcome when the facts include one but is never required. Keep the whole answer only as long as the facts support, within interviewAnswerMaxWords. Never repeat a fact or number without adding new information. Never name the framework or label a part in any field.
Bump CONSULTATION_PROMPT_VERSION per convention and report what the bump triggers.
3. Server validation in the polish quality loop: every required part for the declared framework is present and non-empty, the result passes the lenient check in change 1, and no field contains a framework name or part label (for example "Challenge:", "Situation:", "STAR", "CAR"). A failure feeds qualityFeedback naming the problem and uses the existing bounded regeneration. After the last attempt, follow the existing Batch C behavior (the item shows "Add a bit more detail so Harper can shape this answer."; approved answers are never deleted).
4. Compose: a pure helper joins the parts in framework order into one natural first-person answer (sentence boundaries handled, no labels). The composed answer is what is stored in ConsultationStatement.content and shown, and it respects interviewAnswerMaxWords. Store the parts and answerFramework in ConsultationStatement.groundingJson as an additive shape; existing values are left as they are.
5. The raw-reply and meta-commentary checks from Batch C apply to the composed answer.
6. Confirm no Harper or Cheat Sheet component shows a framework name or part label.

TESTS
Add automated tests that assert:
- A polish output missing a required part, or with an empty result, fails validation and triggers the bounded regeneration.
- A qualitative result with no number passes (include examples from nursing, hospitality, and a new graduate's class project).
- A field containing a label or framework name fails validation.
- The composed answer joins parts in order as natural first-person text with no labels, respects interviewAnswerMaxWords, and is stored in content; the parts and framework are stored in groundingJson.
- whyThisCompany and confirmedGap still produce a single answer with no parts.
- After the last failed attempt, the item shows the existing needs-more-detail message and approved answers are unchanged.
- No rendered Harper or Cheat Sheet output contains a framework name or part label.
- Rendering enqueues no job and makes no paid call.
Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, update checkpoint/harper-prep-hub from main (merge, not reset), commit with a message naming Harper Batch D3, and push that branch. Do not merge into main or push main.

REPORT
1. The schema change, prompt text (before and after), and version bump with what it triggers.
2. The validation rules, including the exact lenient result check, with file and line.
3. The compose helper and storage.
4. Confirmation no framework name or label renders.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that no git command discarded work and nothing outside D3 changed.

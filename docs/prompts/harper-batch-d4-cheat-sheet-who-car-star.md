Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Enforce by structure; no temporary fixes, no data repair, no migrations, no Prisma schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main. If anything unexpected happens, STOP and report.

SURGICAL RULE
Batch D4 only: WHO tags and CAR/STAR answer parts for the Cheat Sheet person guidance (likely questions and sample answers), and for the interview guide only if STEP 1 shows it is displayed. Reuse the D2 tag set and resolver and the D3 parts validation, compose helper, and label check; do not duplicate them. Do not change Harper coach or polish (D2, D3), career stage (D5), role-expertise (D6), or learnings (D7). No tag, framework name, or part label is ever shown to the seeker. Add no features.

STEP 1: IS THE INTERVIEW GUIDE SHOWN ANYWHERE?
Report, with file and line: every place the interview guide (InterviewStage.guide.contentJson, generateInterviewGuideWithModel) is generated, every trigger that generates it, and every component or page that renders it after Batches B1 to B5.
- If it is rendered somewhere a seeker can see, include it in STEP 2.
- If it is generated but rendered nowhere, do NOT change it. STOP on the guide only and report the triggers that still generate it (they may be paying for output nobody sees), for the product owner's decision. Continue with the Cheat Sheet.

STEP 2: IMPLEMENT
1. cheatSheetCoachItemSchema and the person-guidance output schema (src/lib/application-summary/contract.ts): each likely question requires interviewTypeTag (the D2 set). A sampleAnswer is returned as answerFramework plus its parts (same flat, OpenAI-strict approach as D3). Items that carry harperQuestion instead of sampleAnswer (the seeker must supply the story) need no parts.
2. Cheat Sheet guidance prompt (src/lib/prompt-content/application-summary.ts): add exactly this text to the likely-questions instructions:
Every likelyQuestions item includes interviewTypeTag, one of: screening, chronological_walk_through, focused_competency, reference_check_prep. Every sampleAnswer is returned as answerFramework plus its parts, CAR (challenge, action, result) by default or STAR (situation, task, action, result) when setup matters, in natural first-person speech so the parts read as one answer when joined in order. The result states what changed because of the person's action; a number is welcome but never required. Never name the framework or label a part in any field.
Change no other wording. Bump APPLICATION_SUMMARY_PROMPT_VERSION per convention and report what the bump triggers.
3. Validation: reuse the D2 deterministic tag overrides (career walk-through is chronological_walk_through) and the D3 parts validation, lenient result check, and label check. A failure uses the existing bounded regeneration for person-section generation (report what that bound is).
4. Compose the displayed sampleAnswer from its parts with the D3 compose helper. Store the composed text where sampleAnswer is stored today, and the parts and framework alongside it additively in the guidance JSON. Existing guidance without parts is left as it is and displays as today.
5. Order each person's likely questions by the D2 WHO sequence, invisibly.
6. One career walk-through: if a person's likely questions include a career walk-through and Harper has already asked the chronology question for the application, drop the duplicate from the likely questions (reuse looksLikeCareerWalkThrough).
7. Interview guide: only if STEP 1 shows it is displayed, apply the same schema, prompt addition (in src/lib/prompt-content/interview-guide.ts, same text adapted to its field names likelyQuestions and exampleAnswer), validation, compose, and ordering. Report the exact text used.
8. Confirm no Harper or Cheat Sheet component renders a tag, framework name, or part label.

TESTS
Add automated tests that assert:
- A person-guidance output with a likely question missing interviewTypeTag, or a sampleAnswer missing a part, fails validation and uses the bounded regeneration.
- Qualitative results pass; bare words like star or car pass; labels and method references are rejected (reuse the D3 cases).
- The displayed sampleAnswer is composed natural first-person text with no labels; parts and framework are stored alongside.
- harperQuestion items need no parts.
- Likely questions are ordered by WHO sequence.
- A duplicate career walk-through is dropped when Harper already asked the chronology question.
- Existing guidance without parts still displays.
- No rendered Harper or Cheat Sheet output contains a tag, framework name, or part label.
- Rendering enqueues no job and makes no paid call.
- If the guide was changed, the same assertions for the guide.
Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, update checkpoint/harper-prep-hub from main (merge, not reset), commit with a message naming Harper Batch D4, and push that branch. Do not merge into main or push main.

REPORT
1. STEP 1 findings, and whether the guide was changed or stopped.
2. The schema changes, prompt text (before and after), and version bumps with what they trigger.
3. Validation, compose, storage, ordering, and walk-through dedupe, with file and line.
4. Confirmation no tag, framework name, or label renders.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that no git command discarded work and nothing outside D4 changed.

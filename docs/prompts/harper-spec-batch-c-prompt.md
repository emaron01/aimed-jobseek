[BUILD, REPORT] Harper spec, Batch C: right answer on the right question, concise drafts, Super Admin controls

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Per Batch C of docs/prompts/harper-spec-audit-report.md (branch report/harper-spec-audit) and the product owner's approved decisions below, for every kind of seeker. The instruction text below is approved exactly as written; no other instruction wording may change. Every paid call stays behind the paid-call gate. No database schema changes unless reported and approved first: if storing key points or the Super Admin settings needs one, STOP and report it before changing anything. No data repair. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/harper-spec-batch-c. If origin/main does not include Batch B (fix/harper-spec-batch-b), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the six items below. Do not merge or push main.

ITEMS
1. Answers tied to question ids: every answer the answers step returns (best-practice, gap drafts, Ask Harper) carries the id of the question it answers, in the output schema, and is stored only on that question. Remove the echo-text and order-based pairing (alignAnswersToChoices). An answer with a missing or unknown id is discarded and retried within the existing bounded retries, never placed on another question. Follow-ups are stored only on the question they were produced for.
2. No splices: remove restoreStoryOpening, keepEarlierProse, and withStoryOpening. Store the answer the model wrote, once, and remove a sentence that repeats or nearly repeats an earlier sentence in the same answer.
3. Profession-neutral grounding: replace STORY_PLACE_STOP and the capitalized-word place checks with the profile's stored employer, school, and project names. A story must name one of those, and a draft that names a workplace, school, or project the profile does not contain is not stored. Keep rejecting story answers that are only hypothetical ("I would").
4. No duplicates: no best-practice question is created for a target that already has a gap question.
5. Length targets, never truncation: add exactly this text to the answer-drafting instructions (best-practice, gap drafts, Ask Harper, polish):
Write the spoken answer in about {words} words. For a complex or multi-part question, also return 3 to 5 key points: short bullets with the names, numbers, and steps to mention if the interviewer asks for more.
{words} is the length target for that answer's kind: gap and best-practice 150, why this company 120, career walk-through 40 per recent role and 200 in total. Resume bullets stay one line, about 30 words. When a stored answer exceeds its target by more than a small margin, rewrite it shorter once through the existing field-rewrite path; never cut text. Show key points under the answer on its card, and include them wherever the approved answer appears for interview prep (the Cheat Sheet). Report where key points are stored.
6. Super Admin controls: in Super Admin, settings for the best-practice question count (default 8), the overall question limit (default today's value), and the length targets in item 5 (defaults as listed). Harper reads them at run time; changing them needs no code change and triggers nothing on its own. Report where they are stored.
Bump the affected prompt versions, and report what each bump triggers.

TESTS
Choose the minimum relevant tests that prove each item, using sales, nursing, and new-graduate fixtures: answers returned out of order still land on the right questions, and an unknown id is never placed on another question; no answer repeats a sentence; a story naming a workplace not in the profile is not stored, and one naming the profile's school or employer is; no best-practice question duplicates a gap question's target; a complex question gets key points, and an over-long answer is rewritten once, never cut; the Super Admin settings change the count and targets. Update or remove existing tests that required removed behavior, and report which. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

COMMIT
Commit on fix/harper-spec-batch-c and push the branch. Do not merge or push main.

REPORT
1. Each item, with file and line, including every pairing path and splice removed, where key points and the Super Admin settings are stored.
2. The tests updated or removed, and why.
3. The version bumps and what they trigger.
4. The checks run and results, and the commit hash.

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations or schema changes. The only AI instruction change allowed is the approved text below. The paid-call gate, the Harper library, and the fact-preservation rules stay as they are. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Work in C:/Repos/aimed-jobseek-ask-harper-any-question on fix/ask-harper-any-question (at 83feecc), committing on top of it. If origin/main has moved past e087da4, merge origin/main into the branch first (merge, not rebase or reset); if there is any conflict, STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the three items below. Do not merge into main or push main. Change nothing else. Add no features.

CONTEXT
83feecc fixed Ask Harper's can't-answer failure in code: story questions keep the CAR/STAR and outcome checks, and opinion, approach, philosophy, and knowledge questions are answered as a point of view without an outcome. Its instruction text was left unchanged pending approval, and its best-available fallback returns either a raw profile fact or the placeholder "I would answer this from my own point of view, without adding a result I have not stated."

ITEM 1: Approved instruction change
1. In ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS, replace the first paragraph with exactly this text:
Suggested answers: for each question, write the answer this person could give, drawn from their Personal Profile and fitting careerStage (for new_to_workforce or college_graduate, school, internships, projects, part-time work, and activities; for early_career through late_career, roles and results at the level of this job). When the profile has little on a question, still write the strongest suggested answer you can, as a starting point the person will make their own. Keep every number, fraction, percentage, date, company, and name exactly as the person stated it. Never name the framework or label a part in any field. When the question asks for an opinion, an approach, a philosophy, or what the person looks for or knows, answer in the seeker's point of view and support it with an example from the Personal Profile or a prior approved answer when one exists. Do not invent a story result or outcome for that kind of question. For a story question, return answerFramework plus its parts, CAR (challenge, action, result) by default or STAR (situation, task, action, result) when setup matters, in natural first-person speech so the parts read as one answer when joined in order. The result states what changed because of the person's action; a number is welcome but never required. When the person's information doesn't cover the question, write a strong sample answer from your own expertise on the topic, framed as the person's point of view. Never invent personal experience, employers, numbers, or results. Then ask one follow-up question that would let the person add their own example.
2. Keep the rest of the instructions (including the prior approved answer sentences) unchanged.
3. Bump the prompt version per convention and report exactly what the bump triggers. Nothing may regenerate automatically or on a page view, and applications that already have their suggested answers must not re-run.
4. Report every place these instructions are used (Ask Harper and the best-practice suggested answers).

ITEM 2: Follow-up question
Add an optional follow-up question to the answers output. For Ask Harper, show it under the draft the same way Harper shows follow-ups today, so the seeker can answer it through the normal reply flow. For the best-practice suggested answers, store and show it the same way. Report the output field and where it renders.

ITEM 3: Best-available fallback
Replace the current fallback. Never use a raw profile fact as the answer, and never use placeholder or meta text (including "I would answer this from my own point of view, without adding a result I have not stated."). When every attempt fails the checks, show the best actual answer the model returned: the attempt that came closest to passing, with any invented personal experience, employers, numbers, or results removed, shown as a Draft with Save Answer and Approve. Report how "closest to passing" is chosen. The "That isn't an interview question. Ask a real one." message stays only for empty or meaningless input, with no paid call.

TESTS
Add automated tests that assert: the instructions contain the exact new text; the reported question ("What are the key attributes of top performing sales rep on your team?") returns a point-of-view draft with no error; a question the profile does not cover returns a sample-answer draft plus one follow-up question with no invented personal experience, employers, numbers, or results; the follow-up displays under the draft and can be answered through the normal reply flow; a story question still gets the CAR/STAR structure and outcome check; when every attempt fails, the fallback is the closest actual answer and never a raw profile fact or placeholder text; empty or meaningless input shows the not-a-question message with no paid call; an identical question makes no second paid call; existing suggested answers do not re-run; rendering makes no paid call and enqueues no job. Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/ask-harper-any-question with a message naming the approved answers instruction, follow-up questions, and the best-available fallback, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1: the instruction before and after, the version bump and what it triggers, and every place the instructions are used.
2. ITEM 2: the follow-up output field and where it renders.
3. ITEM 3: the new fallback and how "closest to passing" is chosen.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
6. The commit hash, branch, and worktree path.
7. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these items changed.

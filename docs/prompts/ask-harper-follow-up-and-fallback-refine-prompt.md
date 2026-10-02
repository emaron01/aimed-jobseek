Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations or schema changes, no AI instruction text changes. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Run git fetch first. If origin/main already includes 2f9ec2e, create a new worktree and a new branch from origin/main named fix/ask-harper-refine. Otherwise, work in C:/Repos/aimed-jobseek-ask-harper-any-question on fix/ask-harper-any-question (at 2f9ec2e), committing on top of it. Report which. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the two items below. Do not merge into main or push main. Change nothing else. Add no features.

ITEM 1: Follow-up questions only for Ask Harper
The answers output's followUpQuestion (role-expertise.ts) is now stored and shown for both Ask Harper drafts and best-practice suggested answers. Store and show it only for Ask Harper questions. Best-practice suggested answers store no follow-up turn, as before 2f9ec2e. The instruction text stays unchanged. Report where the follow-up is now created and confirm best-practice suggested answers create none.

ITEM 2: Fallback keeps general expertise and numbers
The best-available fallback (ask-harper-answer.ts) removes any sentence containing a number or mid-sentence name not found in the seeker's profile facts, prior approved answers, or the job's title and company. Change it so it removes only sentences that present an unsupported personal claim about the seeker: first-person statements (for example sentences with I, my, me, we, our, or my team) containing a number, result, employer, or name not found in those sources. General expertise sentences, including ones with numbers or names (for example "Top reps keep 3x pipeline coverage." or "MEDDPICC helps qualify deals."), are kept. The fallback still never uses a raw profile fact or placeholder text.

TESTS
Add automated tests that assert: an Ask Harper draft with a followUpQuestion stores and shows the follow-up under the draft; best-practice suggested answers store and show no follow-up even when the model returns one; the fallback removes a first-person sentence with an unsupported number, result, employer, or name ("I grew revenue 40% at Acme." when neither is in the sources); the fallback keeps general expertise sentences with numbers and names ("Top reps keep 3x pipeline coverage.", "MEDDPICC helps qualify deals."); first-person sentences whose numbers and names are in the seeker's sources are kept; the fallback never uses a raw profile fact or placeholder text; rendering makes no paid call and enqueues no job. Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, in the worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit with a message naming follow-ups only for Ask Harper and the fallback keeping general expertise, and push the branch. Do not merge into main or push main.

REPORT
1. Which branch was used, and why.
2. ITEM 1: where follow-ups are created now, with file and line.
3. ITEM 2: the new removal rule, with file and line.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
6. The commit hash, branch, and worktree path.
7. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these items changed.

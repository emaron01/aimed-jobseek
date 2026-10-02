Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix the root cause; no temporary fixes, no data repair, no migrations or schema changes unless reported and approved first, no AI prompt changes. Production data may only be read, through exact read-only SQL given to the product owner to run. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1, the untracked files in C:/Repos/aimed-jobseek, or the fix/personas-layout work. Create a new worktree and a new branch from origin/main named fix/persona-activation-data-loss. If anything unexpected happens, STOP and report.

SURGICAL RULE
Investigate, reproduce, and fix the defect below. Do not merge into main or push main. Add no features.

DEFECT (production, main at 2133bb4, application cmuna46te0019r52o11wi0zm0)
On Personas and Interviewers, the seeker clicked Add to Cheat Sheet on the Executive Sales Sponsor persona and the Channel or Partnerships Leader persona. Result:
- Those two personas no longer appear; they look deleted.
- Two duplicate personas appeared instead: a second "Product or Digital Risk Leader" (Direct) and a second "Revenue Operations Leader" (Indirect), each without a full generation, and each shows "Remove from Cheat Sheet" (they are on the Cheat Sheet), while the originals show "Add to Cheat Sheet".
- The Cheat Sheet now shows those two unwanted personas.
Leading hypothesis (prove or disprove): Add to Cheat Sheet queues HIRING_TEAM_BUILD with deferCheatSheetSection (src/lib/hiring-team/build.ts, src/lib/application-jobs/process.ts), the build re-runs campaign identify (HIRING_TEAM_IDENTIFY) and its sync, and the sync overwrites existing persona rows (changing their names and content to other roles) instead of matching each persona by a stable identity, while cheatSheetActivatedAt stays on those rows.

INVESTIGATE (file and line)
1. The full path from Add to Cheat Sheet through the build worker: identify, the identification sync (including any merge or match of existing roles, for example mergeExistingHiringTeamRoles or equivalent), synthesize, and the chained section job. State exactly how existing persona rows are matched, created, updated, renamed, or deleted.
2. Reproduce locally: an application with several identified personas; add two of them to the Cheat Sheet so the build runs; show the persona rows before and after (ids, names, involvement, approval, cheatSheetActivatedAt). Prove the exact mechanism that removed the two personas and produced the duplicates.
3. Whether the same damage can happen through Generate persona research, Generate all Direct roles, or any other path that runs a build or identify, and since when.
4. Give the product owner exact read-only SQL to run in Render for this application: every Persona row (id, name, involvement, approvalStatus, setupStatus, cheatSheetActivatedAt, createdAt, updatedAt, and any deleted or archived marker); every HIRING_TEAM_BUILD and related ApplicationJob for the campaign with timestamps and payloads; every PaidCallReceipt for HIRING_TEAM_IDENTIFY and HIRING_TEAM_SYNTHESIZE for the campaign with timestamps; and the persona:{id} sections in ApplicationSummary.guidanceJson.
5. Recovery: what of the Executive Sales Sponsor and Channel or Partnerships Leader personas can be recovered (for example from stored paid-call receipt outputs, other stored JSON, or rows that still exist), and propose recovery options for the product owner. Do not change any data.

FIX at the root
- Adding a persona to the Cheat Sheet must never re-identify the hiring team or change any persona other than the one added. It researches only that persona (synthesize for that persona, gated), then writes its section.
- Any identify sync, wherever it runs, must never overwrite an existing persona's identity (name, role) with another role's, never delete a persona the seeker has, and never create a duplicate of an existing role. Report the matching rule used after the fix.
- cheatSheetActivatedAt stays on the persona the seeker added, and only that persona.
If the fix needs a schema change, STOP and report it for approval.

TESTS
Add automated tests that reproduce the reported case and assert: adding two personas to the Cheat Sheet changes only those two personas' cheatSheetActivatedAt and their sections; no other persona is renamed, overwritten, deleted, or duplicated; the build for an added persona does not run campaign identify; any identify sync preserves every existing persona's id, name, and content and creates no duplicates; Generate persona research and Generate all Direct roles also cause none of this; rendering makes no paid call and enqueues no job. Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/persona-activation-data-loss with a message naming the persona activation data loss fix, and push that branch. Do not merge into main or push main.

REPORT
1. The proven mechanism, with file and line and the reproduction's before and after.
2. Which other paths could cause it, and since when.
3. The read-only SQL for production.
4. Recovery findings and options.
5. The fix and the matching rule, with file and line.
6. Every file changed.
7. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
8. The commit hash, branch, and worktree path.
9. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and no production data was changed.

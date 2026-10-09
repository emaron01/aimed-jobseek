[BUILD, REPORT] AI outputs: accept null for every optional field (same bug as outreach seekerEdit)

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fix the root cause for every affected schema, not just the ones that have failed so far. No temporary fixes.

NO STACKING, NO CONFLICTS
Prefer one central fix where the strict JSON schema sent to the model is built (src/lib/ai/zod-json-schema.ts turns .optional() into a required nullable field), so the parse schema always accepts what the model is told it may send. If a central fix is not safe, fix each schema the same way outreach was fixed (ad9ff55). Do not do both. Remove anything the fix makes redundant, including the per-schema outreach change if the central fix covers it. Report any overlapping code.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/ai-optional-null. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.

SURGICAL RULE
Change only how model output is parsed. The JSON schema sent to the model, AI instructions, prompt versions, and paid-call fingerprints do not change. If any of them would change, STOP and report before building. Do not deploy.

CONTEXT
Outreach Generate failed with "seekerEdit: invalid_type": the strict JSON schema made an .optional() field required-and-nullable, the model sent null, and Zod .optional() rejected null. Each failure cost a paid call plus an automatic retry. Fixed for outreach on main at ad9ff55.

CHANGE
1. List every Zod schema used to parse model output under strict structured output that has an .optional() field which does not accept null: file, schema, field, and which feature uses it.
2. Fix them with one approach (central, or per schema), so null parses as "not provided" everywhere and a wrong type still fails.
3. Confirm the schema sent to the model is byte-for-byte unchanged for every affected call, so no fingerprint or receipt changes.

TESTS
Choose the minimum checks that prove the change: null on an optional field parses for each affected schema (or once for the central fix plus one per feature); a wrong type still fails; the model-facing JSON schema is unchanged. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

REPORT
The full list from step 1; which approach was used and why; files and lines changed; anything removed; confirmation the model-facing schemas and fingerprints are unchanged; which checks ran and why; any overlap found; and the branch and commit. Do not merge or deploy; this deploys after owner review.

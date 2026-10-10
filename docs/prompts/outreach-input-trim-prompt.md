[BUILD, REPORT] Outreach: send each message only what it needs (trim from ~58K to ~5K input tokens)

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Follow docs/prompts/outreach-input-size-report.md (branch report/outreach-input-size). Production-grade code; no temporary fixes.

NO STACKING, NO CONFLICTS
Change buildOutreachAssetMessages and buildOutreachFactSelectionMessages (src/lib/application-assets/prompt.ts) in place. No second builder, flag, or fallback to the old input. Remove code and tests that only cover the removed input parts. Report any overlapping code or instruction text.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named feat/outreach-input-trim. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.

SURGICAL RULE
Change only what the outreach message and company-fact-selection calls are sent. The outreach instruction text does not change, except where step 4 finds wording that ranks one seeker source over another (report it with proposed replacement text; do not change it). Resume and cover letter builders are not touched. Do not deploy.

RULE FOR SEEKER FACTS
Everything the seeker supplied (profile built from their resume and LinkedIn, stories, answers, replies to Harper, resume content) is the seeker's facts, all equally valid. Select among them by relevance only, never by source or review status. Each fact is sent once.

CHANGE
1. Message input becomes: a short excerpt of the selected person's persona (their role, pressures, and what they care about); a short excerpt of the job (title, company, key requirements); the 3 selected company facts as citable sources; the most relevant seeker facts drawn from all seeker sources, up to the limits the report proposed (about 8 facts, 8 statements or answers, and 4 story excerpts, adjusted if the report's numbers need it), each sent once; one voice sample; and, when the message type uses them (follow-up, thank-you, check-in), the prior messages to this person and the relevant interview notes.
2. Relevance is chosen by code, with no extra AI call: score each seeker fact against the selected person's role and persona and the job's key requirements, and take the highest-scoring ones. Ties keep a stable order, so the same inputs always produce the same selection and the same fingerprint.
3. Remove from the input: the whole profile object, the full story rows, the duplicated statement array, the seeker transcript, the scorecard, and the raw posting.
4. Check the outreach instruction text and the message builders for any wording or logic that treats one seeker source as more authoritative than another. Report each with file and line and proposed replacement text.
5. Bump all three outreach prompt versions from "5" to "6". Report the fingerprint changes.

TESTS
Choose the minimum checks that prove the change: the built input for the Sift / Ashley Cobb email (from fixtures or the local builder, with no paid call) contains each selected fact once and none of the removed parts; selection is deterministic and draws from all seeker sources; follow-up and thank-you inputs still include prior messages and notes; the input stays under the report's cap. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

REPORT
The new input layout; the relevance scoring and limits used; the measured input size (characters and estimated tokens) for the Sift / Ashley Cobb email before and after; expected cost per message; step 4 findings with proposed text; versions and fingerprints changed; files and lines changed; code and tests removed; which checks ran and why; any overlap found; and the branch and commit. Do not merge or deploy; this deploys after owner review.

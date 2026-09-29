Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no Prisma schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. If anything unexpected happens, STOP and report.

SURGICAL RULE
Correct only the two items below in Caching Phase 2 batch 3 (commit 3cd7c79 on checkpoint/harper-prep-hub). Change nothing else. Add no features.

ITEM 1: Distinct requests must never merge into one serialized job
OUTREACH and CONTACT_PROFILE are now serialized: one IN_PROGRESS and one PENDING per key (organizationId, campaignId, type, targetId), with payload merge on the PENDING job.
- Report exactly what targetId is for every OUTREACH enqueue (outreach per contact and channel, thank-you, check-in, thank-you clarifying questions) and every CONTACT_PROFILE enqueue, with file and line, and what the payload merge keeps.
- Two requests that produce different outputs (a different contact, stage, purpose such as outreach versus thank-you versus check-in, or channel) must never share a key or merge into one job. Fix the key at the root so each distinct output has its own serialization key (for example, targetId composed from contact or stage, purpose, and channel), while a repeated request for the same output still reuses the one PENDING job.
- Confirm the unique indexes and claim logic work unchanged with the new targetId values (no schema change).
- Add tests: a thank-you for one interview stage and outreach to a different contact queued while an OUTREACH job is running produce two separate jobs and both outputs are generated; the same request twice produces one PENDING job; two contact profiles for different contacts never merge.

ITEM 2: "No Changes To {Name}'s Profile" only when nothing changed
- Show that message only when the seeker's submission changed nothing at all (no contact field changed and no profile work needed). If any contact field was saved (for example email, title, phone, or name) but no profile rebuild was needed, show the existing save message instead.
- Report where the message can appear (saveLinkedInPasteAction, buildIndividualProfileAction, updateApplicationContactAction) and the rule for each.
- Add tests: editing only a contact's email shows the existing save message, not the no-changes message; submitting a contact form with nothing changed shows "No Changes To {Name}'s Profile"; pasting the same LinkedIn text again shows the no-changes message.

TESTS
Add the tests above. Run the worker boundary test (--conditions=react-server) and confirm processApplicationJob still loads cleanly. Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on branch checkpoint/harper-prep-hub with a message naming the batch 3 serialization key and profile message fixes, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1: targetId before and after for each enqueue, what the merge keeps, and confirmation distinct outputs never merge.
2. ITEM 2: the message rule per action.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
5. The commit hash and branch pushed.
6. Confirmation that no git command discarded work and nothing outside these items changed.

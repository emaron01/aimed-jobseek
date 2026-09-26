SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

TASK: Fix stale failures, broken links, and text overflow in the application workspace. Work on main. Commit and push when all checks pass.

Production, on an existing application after the flag-and-save deploy, the top card showed:
- "The asset was not saved because its claims did not pass verification. Retry after reviewing the violations." with "Confirm this fact with Harper or edit the Personal Profile." and two links, Harper and Personal Profile. Both links go to a 404 page.
- "Consultation planning did not return a usable plan. Retry consultation."
- The message text runs past the right edge of the card.

1. Stale failures: job failures recorded under the old fail-closed checks must not persist as current errors. Clear or supersede them for existing applications (a migration or a one-time cleanup that is safe on existing data), so the workspace shows the current state. Messages from removed checks must never render again.
2. Links: every link in the workspace goes to a real page. The Harper link scrolls to or opens the Harper section of this application; the Personal Profile link opens the seeker's Personal Profile. Add a test that every workspace link resolves to an existing route.
3. Overflow: all messages and cards in the workspace wrap within their container; nothing runs past the edge.
4. Retry on any failed item works with the current code and clears the failure on success.

TESTS
- Old fail-closed failure records do not render after cleanup.
- Every workspace link resolves to an existing route.
- Messages wrap within their card.
- Retry clears a failure on success.

REPORT
What caused each problem, the fixes, files changed, and a full-suite result.

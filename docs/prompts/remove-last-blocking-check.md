SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

TASK: Remove the last blocking check and audit for any others. Work on main. Commit and push when all checks pass.

PROBLEM
Production, on the Interview Cheat Sheet: "Application Summary guidance did not pass checks. The passing parts were not enough to save. Retry." The flag-and-save change missed this generator.

1. The cheat sheet's guidance section always saves. Remove the "passing parts were not enough" rule and any remaining check that can block it; any invented fact becomes a flag, as elsewhere.
2. Search the entire codebase for every remaining path where a check can block saving or fail a job (messages such as "did not pass checks", "not enough to save", "did not pass verification", "could not be grounded"), and convert each to flag and save. Only unusable model output (unparseable) may retry. List every path found.
3. Add these messages to the obsolete-failure cleanup so existing applications stop showing them.
4. No seeker-facing text may say "Application Summary"; it is the Interview Cheat Sheet.

TESTS
- The cheat sheet guidance always saves.
- No generator anywhere can fail on a quality or verification check; only unparseable output retries.
- Obsolete blocking messages never render on existing applications.
- No seeker-facing text contains "Application Summary".

REPORT
Every blocking path found and converted, files changed, and a full-suite result.

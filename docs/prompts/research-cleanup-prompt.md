Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root. The approved research brief stays exactly as it is; if any instruction text must change, report the exact current and proposed text and STOP on that part for approval. Every paid call stays behind the paid-call gate; this task adds no web searches. No migrations or schema changes unless reported and approved first; no data repair (stored research displays correctly through the fixes, without rewriting rows). Nothing runs on a page view or reruns on its own. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do NOT use C:/Repos/aimed-jobseek (it is on an old branch). Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1. Run git fetch, then create a new worktree and a new branch from origin/main named fix/research-cleanup. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the five items below. Do not merge into main or push main. Change nothing else. Add no features.

CONTEXT (production, CSC application cmuna46te0019r52o11wi0zm0, research on gpt-5.6-luna)
Recent tailored research was strong but showed: literal "\n\n" in the In depth section; uncited pages in the sources list (an Entity Management page, a marketingprod staging subdomain, PDFs about setting up a business in China and the Netherlands, an index page, an M&A webinar); facts whose source was dropped by the source filter still in the text (leaders, the Markmonitor and Com Laude merger, June 2026 news, and competitors cited to cbinsights.com, which is not an approved host); links carrying ?utm_source=openai; long page titles repeated as inline citations after every line; and, on luna, no leadership or culture, although the company's own leadership-team and mission pages existed (terra found https://www.cscglobal.com/service/about/leadership-team/ and https://www.cscglobal.com/service/careers/our-mission/).

ITEMS
1. Paragraphs: research text shows paragraph breaks, never a literal "\n" or "\n\n", on the application company section and the Cheat Sheet company section, for new and already stored research. Report where the literal sequences come from and fix at the root.
2. Only cited sources: the sources list and the "We read N sources" count show only sources cited by at least one kept fact. Uncited pages are not shown, for new and already stored research.
3. No unsourced facts:
   a. Treat the employer's own sister sites as the employer: a domain linked from the anchor host's own pages (for example cscdbs.com linked from cscglobal.com) counts as the anchor for source filtering. Report how sister sites are detected and stored.
   b. A sentence whose only citations point to dropped sources (any host not kept by the filter) is removed before save; a sentence with at least one kept citation stays. Report how sentences without any citation are handled today and keep that behavior unchanged, reporting it.
   c. Strip tracking parameters (for example utm_source) from every stored and displayed link.
   Apply 3b and 3c to new research; for already stored research, apply them at display time without rewriting rows.
4. Short citations: replace inline citations that repeat a page title or domain after each sentence with short numbered markers ([1], [2], ...) that match the numbered sources list and link to the source, on both company sections, for new and already stored research.
5. Read the company's own key pages: during the existing website fetch step (no web searches), find and fetch the anchor host's leadership or team, about, and careers or culture pages from the homepage links, within the existing fetch limits, and send them to the model with the other pages. Report how they are found and the fetch limits.

TESTS
Add automated tests (mocked providers, real Postgres where saving is involved) that assert: stored text with literal "\n\n" renders as paragraphs on both company sections; only cited sources appear in the list and the count; a sister site linked from the anchor host is kept as the employer; a sentence citing only cbinsights.com (or any dropped host) is removed, a sentence with one kept citation stays, and uncited sentences behave as reported; utm parameters are stripped; inline citations render as numbered markers matching the sources list; leadership, about, and careers pages linked from the homepage are fetched and sent within the limits with no web search added; the approved brief is unchanged; a matching fingerprint makes no paid call; nothing runs on a page view. Run npm test (default parallelism, including real-Postgres tests; database up, not in parallel with the build), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/research-cleanup with a message naming research paragraphs, cited-only sources, no unsourced facts, short citations, and key company pages, and push that branch. Do not merge into main or push main.

REPORT
1. Each item: what changed, with file and line, including where the literal newlines came from, how sister sites are detected, how sentences are filtered and how uncited sentences are handled, and how key pages are found.
2. Any instruction change proposed (or STOP), with exact current and proposed text.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
5. The commit hash, branch, and worktree path.
6. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these items changed.

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only, per docs/prompts/employer-research-plan-report.md and docs/prompts/job-focus-research-plan-report.md, with the product owner's decisions below overriding the plans. Every paid call goes through the existing paid-call gate. Nothing regenerates when inputs are unchanged; nothing runs on a page view; nothing reruns existing applications on its own. The only AI instruction text allowed is the approved brief below. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Work in C:/Repos/aimed-jobseek-company-website-anchor on fix/company-website-anchor (at 4612bb7), committing on top of it. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the items below. Do not change downstream uses of research (Harper, why-this-company, best-practice answers, the Cheat Sheet, resume, cover letter, outreach, personas); that is the next batch. Do not merge into main or push main. Change nothing else. Add no features.

PRODUCT OWNER DECISIONS
1. One tailored research run per application, not a shared company record plus a separate job-focus layer. It receives the company website (anchor, from Batch 1), the job posting (title, posting URL, and posting text or the stored job requirement), and the seeker's pasted notes, and follows the approved brief. Reuse a stored result only when its fingerprint matches exactly (same anchor, same posting, same notes, same prompt version); the 90-day reuse of another application's research no longer applies.
2. Approved research brief, used exactly as the research system instructions (replacing the current employer research instructions and the follow-up focus strings, including "products sold", "buyer segments", and "risk or churn signals"):
You are researching an employer for a job seeker preparing to apply and interview for the job in the posting provided. Research only the company identified by the website provided; ignore organizations with similar names. Start with company highlights: what the company does and for whom (products, services, customers, and markets); its size, stage, ownership, and financial health or funding; its leadership team and any recent leadership changes; its strategy, priorities, and news from the past 18 months (launches, acquisitions, partnerships, layoffs, restructuring); its culture, values, and how it describes working there; and its main competitors and market position. Then align with the job: identify the part of the company this job serves (a business unit, product line, service, segment, or market) and research it in depth, including its products and services, customers, competitors, leaders, priorities, recent news, how it fits the wider company, and anything that relates to the job's requirements. Prefer the company's own website and major business news. Cite every fact to a source. Leave a field empty when you find no evidence; never guess. Do not look for sales-prospecting information such as deal sizes, buyer segments, churn risk, or fit scores.
3. Kept sources: pages on the anchor host (and its subdomains); and pages from reuters.com, bloomberg.com, wsj.com, forbes.com, techcrunch.com, businesswire.com, or prnewswire.com whose title or text names the company or the part of the company the job serves. Every other host is dropped before save, including fundraisers (for example gofundme.com) and lookalike or unrelated organizations. Uncited pages are dropped as today.
4. Up to 3 searches, stopping as soon as the anchor-host evidence is enough.

ITEMS
1. Research inputs and output: implement decisions 1 and 2. Store each tailored result per application. If this needs a schema change (for example a nullable campaign or application id on CompanyResearch, or a new table), choose the smallest additive change, state it exactly with its migration SQL, confirm it is safe on the existing database with no backfill, and report it; existing company research rows stay as they are. The output must include the identified part of the company the job serves and the in-depth section for it, alongside the company highlights, with citations. Remove the sales-prospecting fields from what the model is asked for. Bump the research prompt version and report what the bump triggers (nothing reruns on its own; a seeker action on an application runs it once when its fingerprint differs).
2. Source filtering: implement decision 3 in the source finalization step before save, using the anchor host, with the approved news hosts. Report the rule with file and line.
3. Search cap and early stop: implement decision 4; report how "enough" is decided.
4. Model check (report only, no change to which model is used): report whether the research provider attaches web search when the Research AI model is set to gpt-5.6-luna, which environment variable selects that model, and the expected cost per run on terra and on luna at the stored rates, so the product owner can switch by setting and compare. Do not make live paid calls.

TESTS
Add automated tests (mocked providers, real Postgres where saving is involved) that assert: research receives the anchor website, the posting, and the seeker notes, and uses the exact approved brief; the follow-up focus contains no sales-prospecting asks; the CSC posting fixture's result includes a job focus for its digital brand protection, domain, and digital-risk business alongside company highlights; results are stored per application; a matching fingerprint makes no paid call, and a changed posting or notes runs once; another application's research is not reused; kept sources are only the anchor host and the approved news hosts naming the company or its business, and the GoFundMe, oneweekendai.com, and thenorthlineinstitute.com fixtures are dropped; searches stop early when anchor-host evidence is enough and never exceed 3; nothing runs on a page view. Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, in the worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/company-website-anchor with a message naming tailored research per application, the approved research brief, source filtering, and the search cap, and push that branch. Do not merge into main or push main.

REPORT
1. Each item: what changed, with file and line, including any schema change with its migration SQL and safety, the version bump and what it triggers, the source rule, and how "enough" is decided.
2. The model check findings and costs.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
5. The commit hash, branch, and worktree path.
6. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these items changed.

[BUILD + DEPLOY] Employer research quality: outside sources, one leadership timeline, real titles, company hiring and growth

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Implement docs/prompts/employer-research-quality-report.md (branch report/employer-research-quality), recommendation C, with the owner's changes below. Production-grade code; no temporary fixes.

NO STACKING, NO CONFLICTS
Change the existing research path in place: COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS, buildCompanyResearchMessages, coverageSearchFocus and TOPIC_PATTERNS, APPROVED_RESEARCH_NEWS_HOSTS and textNamesCompanyOrJobFocus, sourceKeptForEmployerResearch, addNormalizedSource, validateCompanyResearchResult, and the employerRisksForJobSeeker pattern for hiring. No second research path, checker, or summarizer. Replace old sentences; do not add new ones beside them. Remove code and tests that only cover replaced behavior. Report any overlapping code or instruction text.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named feat/employer-research-quality. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.

SURGICAL RULE
Change only the items below. Search cap stays 3. No automatic re-run of existing research: not on deploy, page view, or version bump. The company research gate (7bf239d) stays as is.

CHANGE
1. Owner-approved instruction text: replace COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS (src/lib/prompt-content/company-research.ts) with exactly the "Proposed system instruction" paragraph in section 6 of the report. Replace the hiringSignals schema line (prompt.ts line 52) and the ownership and news clauses of coverageSearchFocus exactly as section 6 gives them.
2. Outside sources: replace APPROVED_RESEARCH_NEWS_HOSTS with: reuters.com, bloomberg.com, wsj.com, forbes.com, techcrunch.com, businesswire.com, prnewswire.com, globenewswire.com, ft.com, cnbc.com, apnews.com, fortune.com, axios.com, nytimes.com, venturebeat.com, geekwire.com, bizjournals.com, sec.gov (subdomains included). Crunchbase and PitchBook stay out.
3. Name check: an approved-news page is kept only when the company name appears as a whole word in its title, publisher, excerpt, or support labels. The job focus alone never admits it. "sift" must not match "sifting".
4. Coverage: a company page that does not state ownership, funding, or recent news does not close those topics, so the search runs. TOPIC_PATTERNS.recentNews must not count a denial ("no ... in the last 18 months") as recent news.
5. Titles: in addNormalizedSource, a later non-empty title replaces an empty one for the same URL. In validateCompanyResearchResult, when the evidence title is empty, use the model's title if it is non-empty and not the URL. If a title is still empty, the briefing shows the hostname, not the full URL.
6. Hiring: hiringSignals goes through the same posting-overlap removal employerRisksForJobSeeker uses. A sentence that only restates the posting is dropped; a layoff, hiring freeze, expansion, or headcount sentence stays.
7. Bump RESEARCH_PROMPT_VERSION from "9" to "10". Report the fingerprint changes.

TESTS
Choose the minimum checks that prove the change: the GoFundMe, oneweekendai.com, and thenorthlineinstitute.com cases and an unrelated-markets article are still rejected; a CNBC or bizjournals article naming the company as a whole word is kept, and one where the name appears only inside another word is dropped; a company page silent on funding leaves that topic open; a denial phrase does not count as recent news; an empty tool title is filled from a later citation or the model's title, else shown as the hostname; a hiring line that restates the posting is dropped and a layoff line is kept; the live instruction is the approved text; the version is "10". Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

DEPLOY
On passing checks: merge the latest origin/main into the branch, then push to main as a fast-forward (git push origin HEAD:main). If it is not a fast-forward, stop and report. Confirm the deploy happened and report the main commit.

REPORT
The final instruction text as

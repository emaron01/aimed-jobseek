# Employer research quality build

`RESEARCH_PROMPT_VERSION` is `"10"`. The search cap stays 3. Existing research is not refreshed on deploy, page view, or the version bump. The company research gate is unchanged: a matching fingerprint still skips the provider.

## Instruction as shipped

`COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS`:

You are researching an employer for a job seeker preparing to apply and interview for the job in the posting provided. Research only the company identified by the website provided; ignore organizations with similar names. Start with company highlights: what the company does and for whom (products, services, customers, and markets); its size, stage, ownership, and financial health or funding; its leadership team and any recent leadership changes; its strategy, priorities, and news from the past 18 months (launches, acquisitions, partnerships, layoffs, restructuring); its culture, values, and how it describes working there; and its main competitors and market position. Then align with the job: identify the part of the company this job serves (a business unit, product line, service, segment, or market) and research it in depth, including its products and services, customers, competitors, leaders, priorities, recent news, how it fits the wider company, and anything that relates to the job's requirements. Use the company's own website for what it does, who it serves, and how it describes working there. For funding, ownership, revenue, valuation, leadership changes, and news from the past 18 months, cite a reputable outside source when one is available: a major business publication, a newswire, or the company's press release. Do not cite a different organization with a similar name, a fundraiser, a student project, or a directory page about another company. State leadership as one timeline: name the current people the sources name, and include a leadership change only with the date the source gives. If a source names a change and gives no date, say the date is not in the sources. Do not write that there was no leadership change in the last 18 months when a cited source names a change with no date, or when sources name different people in the same role. Hiring and growth is the company's hiring and growth: expansion, a hiring freeze, layoffs, headcount trend, or other open roles. Do not restate this job's title, requirements, or qualifications. Cite every fact to a source. Leave a field empty when you find no evidence; never guess, and do not write that funding, ownership, or a leadership change was absent until you have checked those outside sources. Do not look for sales-prospecting information such as deal sizes, buyer segments, churn risk, or fit scores.

`hiringSignals` schema line: `["string — company hiring and growth only, not this job posting"]`.

When ownership or recent news is still open, `coverageSearchFocus` says: Find cited evidence for: {topics}. For ownership, financial health, funding, and news from the past 18 months, use a major business publication or newswire that names this company, not a different organization with a similar name. The company-website job-focus sentence is unchanged.

## Fingerprints

Both fingerprints include `promptVersion`. Sample input: Sift, anchor `sift.com`, posting title Director, posting URL `https://sift.com/careers/director`, posting text `Director of Sales at Sift.`, no seeker notes. Company fingerprint also uses the default depth policy (3 searches, 8 sources, 90 days).

| Fingerprint | Version 9 | Version 10 |
|---|---|---|
| `applicationResearchFingerprint` | `6eac5a3560031e3d80e0e3fcb1caa46c3db64b72dd376fcb3cb8cef17a6b6b44` | `317e7fe58391b3468c5189e9414f8e83b0118b09756d0e88d1486bc73a030cd2` |
| `companyResearchFingerprint` | `5d47c0430c418555adbd0ad0f3c6005bc681c67f90b460cb8ff2ddf285dab9f9` | `6961f9e09559036706c5b5ba8abe55f3be99a043f42e5d64e14ad1fbe5176ea4` |

A stored receipt hashed with version 9 will not match. The next retry of that application runs again. Nothing enqueues that retry.

## What else stayed overlapping

The old sentence "Prefer the company's own website and major business news" is gone. `textNamesCompanyOrJobFocus` now matches a company name as a whole word. News keeping no longer passes the job focus into that check. `sourceLabel` in `company-briefing.ts` still prefers a publisher name before the hostname when the page title is empty; the numbered source list uses the hostname. Crunchbase and PitchBook are not approved hosts. The search cap is still 3.

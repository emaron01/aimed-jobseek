Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no schema changes, no Harper prompt changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub. Work on fix/harper-standing-structure (currently bc3ac2a, in its worktree if one exists). If anything unexpected happens, STOP and report.

SURGICAL RULE
Reorganize the Harper page's default view into the three sections below, building on the single Where you stand structure already on fix/harper-standing-structure. Do not change Harper's prompts, planning, answer processing, paid calls, the person view, Stage, Outreach, or the Cheat Sheet. Add no features beyond what is listed.

PRODUCT OWNER DECISIONS
1. Page intro, at the top of the Harper page, exactly:
Harper helps you prepare the answers you'll use throughout this application. What you approve here is what she uses to build your resume, cover letter, outreach, and interview cheat sheets. Answer what you can, skip what you can't, review her suggestions, and approve what best represents your background in a professional way. When it's time to interview, your cheat sheet brings it all together.
2. Three sections, in this order. Each is collapsible by clicking its heading, and all three start open. Each heading shows its title with its description directly under the title, visible whether the section is open or collapsed:
   Section 1 title: Where you stand
   Section 1 description: How your experience matches this job, requirement by requirement.
   Section 2 title: Questions that need more information
   Section 2 description: Harper needs a little more from you on these. Your answers fill the gaps in Where you stand.
   Section 3 title: Best-practice interview questions for a {job title}
   Section 3 description: Questions a hiring manager for this role commonly asks, with Harper's suggested answers drawn from your profile. Edit them to make them yours, then approve.
   {job title} is the job title from the application's parsed posting (for example "Senior Director of Sales - North America").
3. Section 1, Where you stand: the summary (for example "Strong 10, Partial 5, None 0") and every requirement once, with its rating (Strong, Partial, or None), Harper's reason, and Expand evidence. When a gap question (from Section 2) has an APPROVED answer, that answer appears under its requirement here, collapsed to one line with an "Approved" badge, expandable to show the Interview answer, Resume bullet, and Show your replies. Approved answers to "Why you want to work at this company" and the career walk-through appear here as their own entries the same way.
4. Section 2, Questions that need more information: every gap question for a requirement rated Partial or None (and overview gaps), including follow-ups, plus "Why you want to work at this company" and the career walk-through, each until its answer is APPROVED. Each shows its question, the seeker's reply (Your reply, collapsed), any draft Interview answer and Resume bullet with Approve and Edit, the needs-more-detail message where it applies, and the answer form (Save Answer, Skip, Ignore). When an answer is approved, the item leaves Section 2 and appears under its requirement in Section 1. Ignored items stay in Section 2, collapsed, with the Ignored link to reopen.
5. Section 3, Best-practice interview questions: every role-expertise question, each with Harper's suggested answer (Interview answer, Draft) and Approve, Edit, and the answer form. When approved, the item stays in Section 3, collapsed to one line with an "Approved" badge, expandable.
6. Every question belongs to exactly one section: role-expertise questions are always in Section 3; gap, overview, why-this-company, and career walk-through questions are in Section 2 until approved, then in Section 1. The render invariant holds: every item with seeker content or an open question renders exactly once on the page.
7. Keep everything already working: reply attachment to the answered question, suggested answers stored on the question turn, drafts kept while typing, no scroll jump, one row of compact action buttons, the processing notice, Ignore and Ignored, needs-more-detail, and anchors (#harper-standing and #harper-q:{questionTurnId} resolve to the item's current section, expanding it if collapsed).

TESTS
Add automated tests that assert:
- The intro text is exact; the three section titles and descriptions are exact, with the job title filled in; all three start open, each collapses and expands by its heading, and the description shows while collapsed.
- A gap question with a draft answer appears in Section 2; after approval it appears once, collapsed with the "Approved" badge, under its requirement in Section 1, and no longer in Section 2.
- Approved why-this-company and career walk-through answers appear in Section 1 as their own entries.
- Role-expertise questions appear only in Section 3 with their suggested answers; an approved one stays in Section 3, collapsed with the badge.
- Ignored items stay in Section 2, collapsed, with the Ignored link.
- Every item renders exactly once across the three sections (render invariant).
- An anchor to an item in a collapsed section opens that section and shows the item.
- Existing behaviors (reply attachment, drafts kept, no scroll jump, one button row, processing notice) still pass.
- Rendering makes no paid call and enqueues no job.
Run the worker boundary test (--conditions=react-server). Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors. If a test fails only under full-suite load and passes alone, report it by name as a flake; do not change it to pass. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/harper-standing-structure with a message naming the Harper three-section page, and push that branch. Do not merge into main or push main.

REPORT
1. The new page structure, with file and line.
2. How each item's section is decided, and how approval moves items.
3. How collapsing and anchors work.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; flakes by name; the worker boundary test result; the test suite, build, type check, and lint results.
6. The commit hash and branch pushed.
7. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside this reorganization changed.

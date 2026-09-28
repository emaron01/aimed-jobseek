SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no schema changes. Never silence or evade a check.

SURGICAL RULE
Correct only the two items below in the Batch C corrections (docs/prompts/harper-batch-c-corrections-report.md, commit 9aee7ff on checkpoint/harper-prep-hub). Change nothing else. Add no features.

ITEM 1: A failed item must never delete an approved answer
finishItemNeedsMoreDetail (service.ts 788-824) "deletes Harper statements for that item". Approved answers are never discarded or changed except by the seeker through Edit.
- Report exactly which statements it deletes today (by status and by which run produced them), with file and line.
- Fix it so it removes only the draft result produced by the failed attempt. Any APPROVED statement for that item stays exactly as it is, and stays shown. If the item has an approved answer, the failed new reply leaves that approved answer in place and shows the message "Add a bit more detail so Harper can shape this answer." for the new reply only.
- Add tests: an item with an approved answer, followed by a new reply that fails, keeps its approved answer unchanged and shown; an item with no approved answer shows the message and no Harper result.

ITEM 2: Replace the CSC fixture with the real posting
csc-senior-director-sales-fixture.ts was built from a different local posting. Replace its contents with the real CSC Global "Senior Director of Sales - North America" posting items below and rerun the company-pitch filter (looksLikeCompanyPitch and the evidenceTargets skip) on them.

Mission:
- Join us to help protect the world's most valuable digital brands while building a disciplined, world-class sales organization defined by execution excellence, leadership depth, and sustainable growth.

Responsibilities:
- Own and deliver North America revenue targets across expansion and new logo acquisition
- Build and operationalize a repeatable, scalable sales process aligned to domain security, digital brand protection cybersecurity buying motions
- Establish ICP-based account segmentation and prioritization focused on high-risk, high-value digital brands
- Develop and coach front-line sales managers to be exceptional people leaders, deal coaches, and performance multipliers
- Directly mentor and develop Account Executives and hunters to improve discovery, qualification, deal strategy, and close rates
- Implement structured qualification and deal management frameworks (MEDDIC or equivalent)
- Drive disciplined pipeline management, forecast accuracy, and CRM adoption
- Establish clear performance expectations supported by leading and lagging indicators (pipeline coverage, win rates, cycle time, expansion penetration)
- Lead structured operating rhythms including weekly pipeline reviews, deal inspections, and quarterly business reviews
- Build enablement programs that continuously elevate sales effectiveness and product fluency
- Partner cross-functionally with Marketing, Customer Success, Product, and Channel to optimize demand generation and customer expansion
- Position domain and brand protection solutions as mission-critical controls within enterprise risk and security strategies

Required:
- 10+ years of progressive sales leadership experience, preferrable in cybersecurity, domain security, SaaS, or digital risk services
- Proven success scaling high-performance teams across expansion and new logo motions
- Demonstrated experience building strong front-line management layers and developing elite sales talent
- Deep expertise in MEDDIC or similar enterprise sales methodologies
- Strong background in metrics-driven performance management and forecast discipline
- Track record of improving seller productivity, retention, and quota attainment
- Experience selling complex, consultative solutions into mid-market and enterprise organizations

Outcomes:
- Deliver North America revenue targets across expansion and new logo acquisition.
- Build and operationalize a repeatable, scalable sales process.
- Improve seller productivity, retention, and quota attainment.
- Drive forecast accuracy, pipeline coverage, win rates, cycle time, and expansion penetration.
- Build a disciplined, world-class sales organization defined by execution excellence, leadership depth, and sustainable growth.

Competencies:
- 10+ years of progressive sales leadership experience, preferably in cybersecurity, domain security, SaaS, or digital risk services.
- Proven success scaling high-performance teams across expansion and new logo motions.
- Experience building strong front-line management layers and developing elite sales talent.
- Deep expertise in MEDDIC or similar enterprise sales methodologies.
- Strong background in metrics-driven performance management and forecast discipline.
- Experience selling complex, consultative solutions into mid-market and enterprise organizations.

Expected result:
- Excluded: the mission. The fifth outcome ("Build a disciplined, world-class sales organization defined by execution excellence, leadership depth, and sustainable growth.") repeats the mission and may be excluded; report whether it is.
- Kept: every responsibility (including "Position domain and brand protection solutions as mission-critical controls within enterprise risk and security strategies", which is a real responsibility despite the word "mission"), every required item, the first four outcomes, and every competency.
If anything other than the mission and the fifth outcome is excluded, fix the rule at the root and report what changed. The fixture test asserts exactly this result.

TESTS
Add or update automated tests for both items as described. Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on branch checkpoint/harper-prep-hub with a message naming these Batch C fixes, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1: what was deleted before, what changed, with file and line.
2. ITEM 2: every excluded and kept item for the real posting, whether the fifth outcome was excluded, and any rule change.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; the test suite, build, type check, and lint results.
5. The commit hash and branch pushed.
6. Confirmation that nothing outside these two items changed.

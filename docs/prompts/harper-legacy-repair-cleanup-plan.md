# Prompt: Harper legacy-repair cleanup plan (plan only)

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PLAN ONLY. Do not change any code, configuration, schema, prompts, or data. Write the plan and stop. Coding starts only after the product owner approves it.

CONTEXT
There are no real users yet. All existing data is test data and will be deleted; the product owner starts over with a fresh account as soon as this phase lands. Three testers start Monday. The goal is production-ready code with no data repair or migration of existing data.

PRINCIPLES
- Production code only: no code that repairs, migrates, backfills, or regenerates existing stored data.
- Surgical: never remove existing functionality beyond what is listed.
- Product code handles structure only; all of Harper's wording comes from her prompts.
- The seeker sees end results, never internal ids, mappings, raw inputs, or technical wording.

CHANGES TO PLAN

1. Remove legacy data repair
List every routine that repairs, migrates, backfills, re-extracts, rebuilds, or regenerates existing stored data (including repairExistingConsultationSession and everything it calls, prepareExistingConsultationSession, the why-this-company re-extract, canned-question and first-person coaching regeneration, result repairs, seen-state rewrites, startup queues for existing applications, and "repaired once" markers). Classify each:
- LEGACY: only fixes data created by older code. Plan its removal.
- LIVE RULE: behavior new data also needs (for example, duplicate prevention or the 10-question cap). Confirm it is enforced in the normal flow when data is created; if it is enforced only by a repair, plan moving it into the normal flow.

2. Harper wording never contains internal references
Production "Where you stand" showed ids such as "(consult_cmuhfts2f0015q62qtplt97md_fact_0)" and "(achievement_8, achievement_11)". Plan the prompt instruction: ids appear only in structured citation fields, never in any text.

3. One source of truth for gap status
Production showed a gap as Closed in the gap list and Partial or Strong in the assessment list. Plan how a gap closed or confirmed through Harper's work shows that same status everywhere it appears.

4. Why-this-company results
Plan how the why-this-company result is built only from the seeker's saved motivation (companyMotivation), with no resume bullet, for new data.

5. Personas step rule
Red with no roles. Green when every Direct role's persona is built. Yellow otherwise. Indirect roles never affect the color, and the "Review remaining personas" pill appears only while a Direct persona is unbuilt. Nothing is ever built automatically to change the color.

6. Plain experience line
"Verified experience: 14.7–16.5 years (176–198 months) toward 10 years across..." becomes a plain sentence, such as "About 15 years of relevant experience across OpenText, Login VSI, Micro Focus, and Gryphon Networks," with no months or ranges.

7. Sidebar layout
The "Review remaining personas" pill overlaps the step name. Plan the layout fix so the pill never covers the label.

THE PLAN MUST INCLUDE, for each change:
- Files and functions affected, and what each becomes.
- Prompt text to add or change, where relevant.
- Schema changes, including removing fields that exist only for legacy repairs, and how the migration is safe.
- Risks to a fresh account, and the tests that will prove it.

Also include: a proposed split into coding passes, the order of work, and anything that would stop a fresh account from working end to end.

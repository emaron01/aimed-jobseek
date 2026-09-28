# REPORT+PLAN — Overnight remaining punch list (A–G)

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before doing anything. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
All findings must be based on the actual code as it exists now, including today's changes: the Phase 1 paid-call guard (PaidCallReceipt, fingerprints, staleAt comparison), same-key job serialization with the type-to-policy mapping, the employerIcpFit switch-off, and persona build reliability. Cite file paths, function names, and line numbers for every claim. No guesses; if something cannot be determined from the code, say so explicitly. Every plan must fix root causes; no patches, no data repair, no migrations of existing data.

SURGICAL RULE
REPORT AND PLAN ONLY. Do not change any code, configuration, schema, prompts, tests, or data. Write the report and stop. Each part below is independent; complete all of them. Coding starts only after the product owner approves each part separately.

PRODUCT RULES THAT APPLY TO EVERY PART
- No paid call runs when its inputs have not changed, including when the seeker clicks Regenerate or Generate; the current result is kept.
- Nothing paid runs on a page view.
- Seekers see end results only, never internal ids, system notes, or system language. Do not propose seeker-facing wording; state where wording is needed and the product owner will supply it.

PART A: Job scorecard (verify only)
Product owner rule: the scorecard (job description scored against the seeker's Personal Profile) refreshes with a paid call only when the profile or the posting changed; otherwise it keeps the current scorecard. Report:
1. Every trigger that generates or regenerates the scorecard (seeker actions, jobs, Harper answers, profile edits, posting edits, anything else), with call chains.
2. Whether any trigger regenerates it when neither the profile nor the posting changed. Specifically, whether answering Harper's coaching questions updates the profile and triggers a scorecard regeneration, and how many times per coaching session.
3. What the Regenerate control does today when nothing changed.
4. A plan to meet the rule using the Phase 1 gate pattern, with the exact fingerprint inputs.

PART B: Interview rounds (verify only)
Product owner rule: when the seeker records a new interview (when, who, how), a cheat sheet is built for the new interviewer. What the seeker learned in earlier rounds is added to the job details used only by cheat sheets. The resume, cover letter, company research, personas, and scorecard never re-run because of a new round. Report:
1. The full flow when the seeker adds an interview, updates a stage, or adds a second interview: every job and paid call it triggers, with call chains.
2. Whether a place exists today for the seeker to record what they learned, and whether it feeds later cheat sheets.
3. Anything that re-runs today that the rule says must not.
4. A plan to meet the rule, reusing existing features where they exist. If a needed feature does not exist, report it instead of designing it.

PART C: Paid-call guard, Phases 2 and 3 (plan)
Using your audit (docs/prompts/paid-calls-unguarded-repeat-cost-audit.md), plan the rollout of the Phase 1 gate to every remaining live paid call. Exclude hiring identify and synthesize (already done) and anything unreachable with default flags or the employerIcpFit switch-off (state which you excluded and why). For each call:
1. The exact fingerprint inputs, and which inputs deliberately do not belong.
2. What "usable stored result" means.
3. What the seeker sees when a click is skipped because nothing changed, and where wording is needed.
4. Whether its job type should move to serialized follow-up jobs once guarded (per the policy mapping), and why.
5. Special cases: consultation quality retries, intentional sends (never gated), cheat-sheet shell and person sections, interview guide sourceHash, company research freshness, job parse.
Then propose an order of rollout in small batches, each independently testable, with the risk of each batch, highest cost impact first.

PART D: Ignore verification (report)
For Harper's coaching questions:
1. Does every read of analysisJson.ignored go through one helper? List every read and write, with file and line.
2. What do the existing tests actually assert for "an ignored question is never asked again or rephrased"?
3. Is re-asking prevented server-side (for example, does questionNearDuplicate compare new questions against ignored ones), or is it left to the model? Trace the code.
4. Any gap, and a plan to close it at the root.

PART E: Legacy mergeExistingHiringTeamRoles on page load (plan)
1. What it does today, what data it changes, and why it exists.
2. Whether it is still needed after today's Phase 1 and serialization changes, and what would break if it were removed.
3. A plan to remove it from page load (the product rule: nothing that changes data or costs money runs on a page view), including where any still-needed behavior should live instead.

PART F: Truncated application name in the sidebar (plan)
1. Where the application name is rendered in the sidebar, and exactly why it is truncated (CSS, character limit, layout).
2. A plan to show the full name without breaking the sidebar layout at desktop and mobile widths.

PART G: Usage cost accuracy (report)
1. How usage events record provider and model, and how cost is computed from AiModelRate (resolveRate or equivalent).
2. Whether events logged with provider "openai-responses" match their rate rows, or fall back to a different, higher rate. Show the exact matching logic.
3. A plan to make cost reporting use the correct rates, without changing what is billed or any provider behavior.

TESTS
Do not run or write tests. For each part, list the tests its implementation would add, each with what it asserts.

REPORT
Deliver Parts A through G in order, each with numbered sections matching its items, its tests list, and its own short list of risks or unknowns. Save the full report to docs/prompts/overnight-remaining-punch-list-report.md. Make no code changes.

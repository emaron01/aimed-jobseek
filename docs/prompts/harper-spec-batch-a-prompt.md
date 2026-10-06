[BUILD + DEPLOY] Harper spec, Batch A: cards, one reply path, no jumping, hide evidence

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
UI only, per Batch A of docs/prompts/harper-spec-audit-report.md (branch report/harper-spec-audit). No change to what Harper generates, rates, or stores. Hide, do not delete: fact data stays. Use existing components and design tokens; no new colors. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/harper-spec-batch-a. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the five items below. Change nothing else. Collapsed approved cards keep showing the question text, as today.

ITEMS
1. Hide "Expand evidence" on every Where you stand row (ConsultationStanding.tsx, the evidence link block). Keep the fact data.
2. One bordered card per requirement in Where you stand, holding the requirement, its strength, its explanation, and its question card (with draft or approved answer and controls) together. Question cards in the other sections stay bordered cards.
3. One reply path: once a draft or approved answer is showing on a card, the reply box is not shown (Edit, Approve, and Regenerate are the actions). Before any draft, the card shows one reply box. Skip and Ignore stay available as secondary actions outside the main action row. A requirement with a question does not also show the share box.
4. The Cheat Sheet's sample drafts use the same action row (Edit, Approve, Regenerate) as Harper question cards.
5. No jumping: when a Harper job finishes (the live-status refresh after Regenerate or a reply), the page keeps the seeker on the card they were on, using the existing keepHarperQuestionInPlace behavior.

TESTS
Choose the minimum relevant tests that prove each item, using at least one nursing and one new-graduate fixture card as well as a sales one. Update or remove any existing test that required "Expand evidence" or the old layout, and report which. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
What changed for each item, with file and line, the tests updated or removed, the checks run and results, and main before and after.

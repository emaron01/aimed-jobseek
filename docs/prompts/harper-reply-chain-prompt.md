Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no schema changes. The only Harper prompt text change allowed is the approved text in ITEM 4; any other prompt change must be reported and approved first. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub. Create a new branch from main named fix/harper-reply-chain. If main does not yet include 773edb9 (the resume page and workspace refresher fixes), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the four items below. Change nothing else. Add no features.

CONTEXT (production, application cmuna46te0019r52o11wi0zm0)
On the question "In one of your recent North American sales leadership roles, how did you divide ownership between winning new enterprise customers and expanding existing accounts, and what revenue result did that approach produce?" the seeker saved three replies in order:
1. "The GTM I developed at OpenText was split into two - GSI and end customers... this splits to about 60/40."
2. The same text with "this splits to about 70/30. We revenue generated was $6.8MM in FY26 - With over $3.5MM in new enterprise revenue."
3. "revenue generated was $6.8MM in FY26"
The page showed reply 3 twice, each followed by "Add a bit more detail so Harper can shape this answer." No draft was produced, although reply 2 is a complete answer.

ITEM 1: Harper reads all of the seeker's replies to a question together
- INVESTIGATE (file and line): what extract and polish receive when a question has several seeker replies: only the latest reply, or the whole chain.
- FIX at the root: when processing a reply, extract and polish receive all of the seeker's replies to that question (and its follow-ups), in order, as the material for the answer, with the latest reply taking precedence where facts conflict (for example 70/30 replaces 60/40). This is a payload and structure change.

ITEM 2: Reply 3 appears twice
- INVESTIGATE: whether two seeker turns were stored for reply 3 (a double submit or a retried request) or one turn renders twice. Cite the stored data shape (without changing data) and the code path.
- FIX at the root: if a double submit, make saving a reply idempotent so a repeated submission of the same reply within the same request window creates one turn and one processing run; if a render issue, each turn and each outcome renders once. At most one outcome message shows per question, under the latest outcome.

ITEM 3: Editing an existing reply always re-triggers processing
Confirm, with file and line, that editing a saved reply (Edit, then save) records the change before enqueueing and always triggers processing that ends in a visible outcome. Fix if it does not. No automatic reprocessing of existing data.

ITEM 4: Harper always gives her best answer
PRODUCT OWNER RULE: Harper always writes the strongest answer the seeker's replies support, even when details are missing, and never invents facts. When an important detail is missing, she also asks one follow-up question that would make the answer stronger. The message "Add a bit more detail so Harper can shape this answer." is used only when the replies contain nothing usable (empty, meta commentary, or non-answers); it is never the outcome for a reply with real content.
- Add exactly this text to Harper's extract instructions and polish instructions:
Always write the strongest answer the person's replies support, even when details are missing. Never invent facts to fill gaps. When an important detail is missing, also ask one follow-up question that would make the answer stronger.
Change no other wording. Bump CONSULTATION_PROMPT_VERSION per convention and report what the bump triggers.
- Code: a reply with real content always results in a draft (Interview answer and Resume bullet, with Approve and Edit), plus a follow-up question under the same question when the answer is missing an important detail. Where extract today marks a reply incomplete and skips polish, polish must still run with the available material. Where the D3 parts validation or the lenient result check fails after the bounded regeneration because a detail (such as the result) is missing, show the best available draft built only from what the seeker said, plus the follow-up asking for that detail, instead of the needs-more-detail message; the draft must never contain invented facts, framework names, or part labels, and must keep numbers and names exactly as stated. The Batch C non-answer checks (meta commentary, fragments, raw notes) still apply.
- Approved answers are never replaced without the seeker approving a new draft.

TESTS
Add automated tests that assert:
- Using the three replies above as fixtures, processing the third reply sends all three to extract and polish in order and produces a draft, with 70/30 used over 60/40.
- A reply with real content but a missing detail (for example no result stated) produces a draft built only from what was said (no invented result) plus a follow-up question asking for the missing detail, not the needs-more-detail message.
- An empty reply, meta commentary, or a non-answer still produces the needs-more-detail message and no draft.
- A repeated submission of the same reply creates one turn and one processing run; each turn and outcome renders once; at most one outcome message shows per question.
- Editing a saved reply triggers processing and ends in a visible outcome.
- The extract and polish instructions contain the exact new text.
- Rendering makes no paid call and enqueues no job.
Run the worker boundary test (--conditions=react-server). Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors. If a test fails only under full-suite load and passes alone, report it by name as a flake; do not change it to pass. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/harper-reply-chain with a message naming the Harper reply chain, best-answer rule, duplicate reply, and edit reprocessing fixes, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1: what extract and polish received before, and the fix, with file and line.
2. ITEM 2: whether it was a double submit or a render issue (with the evidence), and the fix.
3. ITEM 3: the edit path and any fix.
4. ITEM 4: the prompt text before and after, the version bump and what it triggers, and every code path changed so a reply with content always yields a draft plus an optional follow-up.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; flakes by name; the worker boundary test result; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside these four items changed.

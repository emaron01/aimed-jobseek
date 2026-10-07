[BUILD, REPORT] Resume bullets: one clean instruction, simpler code, seeker's bullets permanent

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Replace the bullet system's stacked instructions and post-processing with one clean instruction and a small set of code rules, per docs/prompts/bullet-prompts-report.md, for every kind of seeker. The instruction text below is approved exactly as written. A bullet the seeker has edited or picked belongs to the seeker and is never rewritten, replaced, moved, or unpicked by Harper. Every paid call stays behind the paid-call gate and runs only when the seeker clicks Refresh bullets (or when no candidates exist yet), never on page view, Save, or Generate. No schema changes: store seeker bullets in existing JSON; if that is not possible, STOP and report before changing anything. Copy lives in the product config. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/bullets-clean. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the items below. Do not merge or push main.

ITEMS
1. Instruction: replace the entire bullet candidate instruction (src/lib/prompt-content/application-assets.ts lines 17-23) with exactly this text:
Write resume bullet candidates from the seeker's own evidence for this job.
Facts: Use only the supplied evidence. The seeker's words are the facts. Never add or change a number, employer, customer, title, date, credential, skill, or outcome.
Placement: Put each bullet under the role where it happened: the role whose employer the evidence or its question names, or the role an achievement is listed under. If you cannot tell, give your best guess and set needsJobCheck to true. If the evidence is not about any one role, set roleId to null. Each bullet covers one employer.
Ownership: Describe the seeker's real part. Say the seeker led, managed, or coached others only when the evidence says so for that role. When a team result came from the seeker's coaching, say so, for example "Coached the team to close...".
Content: Write up to the number of bullets given for each role, best first: the seeker's biggest stated results (numbers, named customers, scope, awards), then bullets that speak to this job. Every distinct result with a number appears in a bullet. Never write two bullets for the same result. Write bullets only for accomplishments; skip work arrangements, commute, pay, availability, and why the seeker wants the job.
Style: One line, under 30 words. Start with a strong verb and the result. Do not name the employer; the job heading shows it. Customer and partner names are fine. Name at most two teams or departments. Leave story details, such as system counts and step-by-step methods, for interviews. No filler endings.
Return structured JSON only.
Output shape: { bullets: [{ roleId (or null), text, evidenceIds, needsJobCheck }] }. Each role's requested count is its band maximum (not twice it). Keep the existing split of evidence that names more than one employer.
2. Code rules after the model returns, in this order, and no others: parse; drop a bullet citing an unknown evidence id; strip a profile employer name from the text (no retry call); apply the seeker's job corrections (they win); collapse bullets with the same amounts and named customers within a role; bullets with roleId null go to General background; show each role's bullets in the model's order; Harper recommends the role's band count from the top; a bullet with needsJobCheck shows a "Check the job" flag beside its job selector and is not pre-checked until the seeker confirms its job (by choosing it in the selector or checking it), and the confirmation is remembered like a job correction.
3. Remove: the employer-name retry call, the coverage follow-up call, the attribution code that overrides the model's role (except the seeker's corrections and the employer-name strip), General background as the default for unnamed evidence, the second candidateCount cut in the picker, and the digit and job-specific point scoring. Report each removal with file and line.
4. Seeker bullets permanent and reusable: when the seeker saves an edit, the bullet becomes a seeker bullet stored as its own item (text, job, stable id). It shows in its job, is picked by default, and is never rewritten, replaced, or moved by a candidate run; it stays until the seeker removes it. Picks persist by stable id; a candidate run never unpicks anything (a picked candidate a later run would drop is kept as a seeker bullet). Seeker bullets stay seeker evidence for later candidate runs on any application and for the citation check. Carry over existing saved edits and picks without loss.
5. No automatic refresh: resume Generate never runs the candidate call; it uses the current picks. The candidate call runs only when the seeker clicks a visible "Refresh bullets" button in the picker (always shown once candidates exist), or when no candidates exist yet. A refresh only adds candidates for results not already covered by a seeker bullet or a pick.
6. Resume writer: it writes only the summary, skills, and each role's title, company, and dates; picked bullets are placed by code exactly as picked. Remove the writer instruction sentences that ask it to write or paraphrase bullets, and remove the conflicting SEEKER_REPLY citation rule so the seeker's replies and seeker bullets are valid sources. Report the exact sentences removed. The approved summary sentence stays.
Bump the bullet candidate and resume prompt versions, and report what each bump triggers.

TESTS
Choose the minimum relevant tests that prove each item, using sales, nursing, and new-graduate fixtures: the instruction text is exact; no retry or follow-up call is made; a needsJobCheck bullet shows the flag and is not pre-checked until confirmed; an edited bullet survives Generate and Refresh unchanged and stays picked; Generate makes no candidate call; Refresh only adds; existing edits and picks carry over; picked bullets appear on the resume exactly. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

COMMIT
Commit on fix/bullets-clean and push the branch. Do not merge or push main.

REPORT
1. Each item, with file and line, and every removal.
2. How existing edits and picks were carried over.
3. The version bumps and what they trigger.
4. The checks run and results, and the commit hash.

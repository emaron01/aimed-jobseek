[BUILD + DEPLOY] Resume picker: strongest accomplishments first, running indicator, no counter, visible job selectors, no company names in bullets, attribution uses the question

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fixes to the deployed resume picker, for every kind of seeker. The instruction text in items 4 and 6 is approved exactly as written; no other instruction wording may change. Reuse the existing inline spinner and live refresh used elsewhere. Every paid call stays behind the paid-call gate. Copy lives in the product config. Use existing design tokens (an existing light yellow); no new colors. No schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/picker-polish. If origin/main does not include fix/bullet-attribution, STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the six items below. Change nothing else.

CONTEXT (production, Sift application cmux4btmv0005p32prkebgtka)
The Personal Profile lists under RAMP Advertising: "Hired, trained, and managed account managers, contributing to a minimum year-over-year ARR increase of $9.7 million." The candidate bullet was correctly placed under RAMP Advertising but its text read "Hired, trained, and managed Gryphon Networks account managers...", inserting an employer the seeker never wrote there. Other bullets also write company names into the text ("Built OpenText's ...", "Login VSI's ..."). Only 3 OpenText candidates were offered (band 3 to 7), and the seeker's strongest OpenText results were never written as candidates at all (a multi-threaded $1.3MM Bank of America close, forecast deviation improved from 20% to 5–10%, $6.8MM FY26 revenue including $3.5MM+ new enterprise, and the VMware campaign with $3MM+ pipeline), although approved answers state them. The instruction ranks job-specific bullets ahead of general accomplishments and lets the model write fewer bullets than requested, so strong results the posting does not mention are lost and the resume reads as generated from the job description.

ITEMS
1. Running indicator: while resume bullets are being prepared (from the Prepare button or from Generate), show the existing inline spinner with the text exactly "Harper is preparing your resume bullets…", and refresh the picker automatically when they are ready, like other pages.
2. Remove the selected-count text ("{count} selected.") and the out-of-range note ("This role has N picks..."). Keep "Recommended bullets: {min} to {max}."
3. Job selectors: give each bullet's job selector the existing light yellow background so it is easy to see, while the bullet text stays the main focus.
4. No company names in bullets: add exactly this sentence to the bullet candidate instruction, after the sentence that begins "Start each bullet with a strong action verb":
Do not write the employer's name in a bullet; the job heading already shows it. Customer and partner names the seeker stated are fine.
In code, when a candidate's text names any Personal Profile role's employer, send it back once through the existing retry asking for the bullet without the employer's name. If it still names one, remove the name when it is a simple possessive or prefix (for example "OpenText's" or "Merion Publications"); otherwise drop the bullet and log it. A bullet built from a Personal Profile achievement always stays with that achievement's role. A seeker's job correction still wins.
5. Attribution uses the question: for an approved answer or seeker reply, the attribution check considers the text of the question it answered together with the answer. If the question or answer names exactly one Personal Profile role's employer, the evidence belongs to that role; if they name more than one (for example "OpenText or Login VSI"), the answer's own text decides, and if it names none, the evidence goes to General background. Pass the question text with each evidence item to the candidate call so the model sees it too.
6. Strongest accomplishments first: in the bullet candidate instruction, replace the sentences "For each role, write up to the number of bullets given for that role." and "Rank job-specific bullets ahead of general accomplishments for the same role." with exactly:
For each role, write the number of bullets given whenever the evidence supports it. Lead with the seeker's strongest accomplishments (results with numbers, named customers, scope, awards), whether or not the job description mentions them, then add bullets that speak to this job's requirements. Every distinct result the seeker stated for a role appears in at least one bullet. Rank by strength of evidence and relevance to this job together.
Pre-checked recommendations follow the same ranking.
Bump the bullet candidate prompt version, and report what that triggers.

TESTS
Choose the minimum relevant tests that prove each item, including: a bullet from the RAMP achievement stays under RAMP and never names another employer; a possessive employer name is removed; customer names such as Bank of America or AT&T are kept; an answer whose question names OpenText is assigned to OpenText even when the answer does not; an answer to a question naming two employers with no employer in the answer goes to General background; a role with more distinct stated results than the job requirements mention gets candidates for all of them, up to its count, with the strongest results first. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
What changed, with file and line, the version bump and what it triggers, the checks run and results, and main before and after.

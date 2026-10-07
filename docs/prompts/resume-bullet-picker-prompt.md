[BUILD, REPORT] Resume picker: bullets only, twice each role's range, every role, picked bullets used as written

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Rework the deployed "Harper Approved Statements" picker, for every kind of seeker. The seeker's word is the evidence. Every paid call stays behind the paid-call gate and runs only on a seeker action or when its inputs change, never on page view. No schema changes unless reported and approved first (the existing picks column stays). No instruction wording beyond the item's stated rules unless reported and approved first (exact proposed text, then STOP on that part). Copy lives in the product config. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/resume-bullet-picker. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the items below. Do not merge or push main.

CONTEXT (production, Sift application cmux4btmv0005p32prkebgtka)
The picker lists every approved interview answer as long paragraphs, groups them by matching company names in the text (so the Micro Focus role is missing and a VMware story sits under Login VSI), and includes answers from another application (CSC's why-this-company and 90-day plan). The product owner wants a short bullet picker.

ITEMS
1. Candidate bullets: one batched writing call (luna, behind the paid-call gate, fingerprinted on the seeker's approved evidence, Personal Profile, and the job) turns the seeker's evidence (Personal Profile achievements, approved interview answers, approved resume bullets, and seeker replies) into one-line resume bullets of about 30 words, each assigned by the model to a Personal Profile role id, and ranked for this job. Report the proposed instruction text and STOP on it for approval before using it.
2. Per role: every Personal Profile role inside a bullet band appears in the picker (roles 15 or more years ago appear only when the plan marks them directly relevant). Each role shows up to twice its band's maximum in candidates (for example a 3 to 5 band shows up to 10), job-relevant bullets first; when there are not enough job-relevant bullets for a role, fill with that role's best general accomplishments. Harper's recommended set (within the band) is pre-checked.
3. Exclusions: why-this-company answers, and evidence specific to another employer's application (for example answers written for CSC), are never used as candidates.
4. Picked bullets are used as written: the resume uses each picked bullet exactly as shown in its role. The writer may add only roles' title, company, and dates, the summary, and skills; it does not add unpicked bullets.
5. The picker shows only the bullets: no interview-answer paragraphs, no requirement tags, no source text.

TESTS
Choose the minimum relevant tests that prove each item, using sales, nursing, and new-graduate fixtures: candidates are one line and assigned to role ids; every role in a band appears, each with up to twice its band's maximum and a pre-checked set within the band; a role with few job-relevant bullets is filled with general accomplishments; why-this-company and other-application evidence are excluded; picked bullets appear on the resume exactly as written and unpicked ones do not; the picker renders bullets only; the candidate call is skipped when inputs are unchanged and never runs on page view. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

COMMIT
Commit on fix/resume-bullet-picker and push the branch. Do not merge or push main.

REPORT
1. Each item, with file and line.
2. The proposed instruction text for item 1 (STOP for approval if not yet approved).
3. The cost per run of the candidate call, and what triggers it.
4. The checks run and results, and the commit hash.

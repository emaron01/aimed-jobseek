[BUILD, REPORT] Harper: real stories, honest method claims, full experience years

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fix root causes. The two instruction additions below are approved exactly as written; no other instruction wording may change. Every paid call stays behind the paid-call gate. No schema changes or data repair. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/harper-answer-quality. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the three items below. Do not merge or push main.

CONTEXT (production, the seeker's Sift application)
Best-practice drafts answered story questions hypothetically ("Describe a joint customer call where your coaching changed an account executive's strategy" was answered with "I would review the customer's stated pain..."). Several drafts said the seeker uses Command of the Message, which the seeker has not stated (the seeker's approved answers describe the practice, building value from discovery, without naming it). The assessment said "About 8 years of relevant experience across OpenText, Login VSI, and Gryphon Networks" for a requirement of 8–10+ years leading enterprise sales, and rated it Partial, although the seeker has more than 20 years.

ITEMS
1. Story answers: add exactly this text to the answer-drafting instructions used by best-practice answers, Ask Harper, and gap drafts:
For a story question (tell me about a time, describe a situation, give an example), tell a real experience from the Personal Profile or approvedAnswers as what happened. Never answer a story question hypothetically with "I would". When no stated experience fits exactly, use the closest stated experience and say plainly what happened there.

2. Named methods: add exactly this text to the answer-drafting instructions above and to the planning writing instructions:
You may describe the person's actual practice using the job's terminology (for example, "my discovery-to-value approach, which works like Command of the Message"), but never claim the person formally uses, was trained in, or is certified in a named method, framework, or tool they have not stated.

3. Years undercount: report, with file and line, why the experience years for that requirement counted only some roles (for example the writing step choosing relevantRoleIds for years-of-experience targets), and fix the root cause so every stated role where the required experience was used is counted.

Bump the affected prompt versions.

TESTS
Choose the minimum relevant tests that prove each item (the exact texts are in place; years count every qualifying role for the reported case). Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

COMMIT
Commit on fix/harper-answer-quality and push the branch. Do not merge or push main.

REPORT
1. Each item: what changed, with file and line, and the years root cause.
2. The version bumps and what they trigger.
3. The checks run and results, and the commit hash.

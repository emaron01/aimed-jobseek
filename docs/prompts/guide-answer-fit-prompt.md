[BUILD, REPORT] Prep guides: answer fit, one use per answer, Regenerate tailors the seeker's answer

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Production-grade code on the existing person-guide likely-question path and the existing regenerate/polish path. No temporary fixes.

NO STACKING, NO CONFLICTS
Edit the existing instruction sentence, resolvePersonLikelyQuestions, and the existing regenerate path in place. For item 3, reuse the existing seeker-polish path (regenerateConsultationStatement / the "Polish my answer" instruction) rather than adding a new call or a new instruction block; if the polish instruction can carry the tailoring rule, extend it in place. Do not add a second path, flag, or fallback. Remove any code or test that only covers replaced behavior. Report any overlapping code or Harper instruction text.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/guide-answer-fit. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree.

SURGICAL RULE
Change only the three items below. The Harper page's Regenerate and "Polish my answer" behavior stays exactly as it is today. Do not deploy.

CONTEXT
After version 19, a regenerated VP of Marketing guide on the Sift application (cmux4btmv0005p32prkebgtka) showed:
- The same approved answer (OpenText Migrate) copied onto two questions.
- A Product-only story (VRA) attached to "Describe a time Product, Marketing, or Customer Success disagreed…", a question not narrowed to Marketing.
- Copied approved answers show Draft with Approve, Regenerate, and Edit. The owner keeps that (it forces a read), but Regenerate on a copied answer must tailor the seeker's own answer to the guide question, not write a new answer.

CHANGE
1. Instruction. In src/lib/prompt-content/application-summary.ts, replace the sentence "For each question, if one of the seeker's approved answers fits it, set approvedAnswerId to that answer's id; an answer fits only when its story shows what this interviewer is asking about." with exactly:
"For each question, if one of the seeker's approved answers fits it, set approvedAnswerId to that answer's id. An answer fits only when its story directly answers the question as written and shows the seeker working with this interviewer's function; a story that mentions their function only in passing does not fit. When a question names several functions, narrow it to this interviewer's function. Use each approved answer at most once, on the question it answers best."
Bump APPLICATION_SUMMARY_PROMPT_VERSION from "19" to "20".

2. One use per answer (resolvePersonLikelyQuestions). If the same approvedAnswerId appears on more than one question, keep it on the first (most likely) question; every later question with that id gets a blank answer.

3. Regenerate on a guide answer copied from an approved answer, or written by the seeker, tailors that answer to the guide question. It sends the guide question and the current answer text, and uses this instruction text exactly:
"Rewrite the seeker's answer so it directly answers this question. Use only the story, facts, numbers, and names already in the seeker's answer. Do not add a new story, fact, or claim, and do not change any fact. Keep the seeker's voice and keep it concise, about 150 words."
The result saves as a draft on the guide question's own turn (cheatSheet:{itemId}). The original approved statement is never changed. It is one paid call per click through the existing paid-call gate. Report the polish path's current instruction text and prompt version, and the version bump this needs.

TESTS
Choose the minimum checks that prove the change: a repeated approvedAnswerId stays only on the first question and later ones are blank; Regenerate on a copied guide answer sends the guide question and the seeker's text with the tailoring instruction, saves to the guide turn, and leaves the original approved statement unchanged; the Harper page's Regenerate is unchanged; the live instruction contains the new sentence and the version is "20". Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

REPORT
Files and lines changed; the polish path reused for item 3 and its final instruction text; prompt versions bumped; code and tests removed; which checks ran and why; any overlap found; and the branch and commit. Do not merge or deploy; this deploys after owner review.

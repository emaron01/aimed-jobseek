SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.
PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
SURGICAL RULE
Change only what is listed below. Pass 3 (layout and evidence display) comes later; do not start it.
TASK: Pass 2 of the approved plan: Harper's words come only from her prompts. Implement sections 1a through 1g, 4, and 5 of your plan, with the changes below. Work on main. Commit and push when all checks pass.
RULE FOR EVERY QUALITY CHECK IN THIS PASS
A quality check may only trigger regeneration with qualityFeedback. After the existing retry limit, accept the latest model output. Never drop a question, never substitute product text, and never fail generation because of a quality check. The one exception stays: never show the seeker's raw reply as Harper's result (isRawSeekerResult).
0. Why-this-company correction for existing sessions
The Pass 1 re-extract of existing why-this-company cards runs only in startConsultation, so sessions already in progress (such as the production CSC application) may never get it. Run it once for existing sessions when the Harper page loads or when the worker processes the session, without requiring Start.
1. Harper wording moves into her prompts (plan 1a to 1g)
- 1a: delete withRoleSourceAsk and the appended sentence. Add the plan's role-source instruction to the coach and extract prompts. questionNeedsRoleSource may only trigger regeneration; after retries, accept the question as written.
- 1b: remove defaultGapShareQuestion, the why-this-company fallback question, and the whoCaresNote fallback. Add the plan's instructions to the coach prompt. A missing whoCaresNote triggers regeneration; after retries, keep the question and show it without the note. Never drop the question.
- 1c: remove askForStory, keepCoaching, missingStarAsk, and followUpForMissingStar as text sources, and stop keying isGenericFollowUpText off askForStory. Add the plan's extract instruction. Extract receives qualityFeedback on retry; after retries, accept the extract as is. Remove these strings from product config if nothing else uses them.
- 1d: use the model's importantGaps as written. Remove the replacement with assessment text and the hardcoded "No remaining experience gaps..." sentence. Add the plan's briefing instruction.
- 1e: remove personPrepFallbackOpening. Add the plan's interviewer-prep opening instruction. If the opening is empty after retries, store nothing.
- 1f: interviewer prep becomes the interviewerPrep setting in the payload, never a target or assessment, and the "Harper prepares the seeker..." text is removed everywhere. Use the plan's prompt paragraph.
- 1g: the follow-up body is coaching plus the question only when they differ; one copy when they are the same; no fallback text.
- "The plan for this conversation is complete." (planComplete): show only Harper's closingNote. If it is missing, show nothing.
2. Share some details goes straight to Harper
Do not create or plan a question when the seeker uses Share some details. The seeker's input goes directly to Harper's extract and polish against that gap's target, with the full Personal Profile, and produces one of the three outcomes (statement that closes the gap, one follow-up, or confirmed gap with a bridging talk track).
3. Partial gaps build on existing evidence
For a gap rated Partial, Harper's question or Share some details prompt briefly states what the Personal Profile already supports and asks only for the missing piece. When the seeker adds it, Harper combines the existing supporting evidence with the new detail into one statement. The seeker never has to recreate what is already supported. Add this to the coach, extract, and polish instructions.
4. Never block (plan 4)
Plan, extract, and polish follow the rule above: regenerate, then accept. Add the loop guard from your plan: once the prompt version is current, voice issues in stored briefings or standing must not trigger another reassessment, so accepting after retries cannot cause repeated reassess jobs.
5. Extract writes first person or neutral (plan 5)
Add the plan's extract instruction: facts, story fields, coaching, follow-ups, and explanations are first person or neutral, never "the seeker", "the candidate", "he", "she", or the person's name.
6. Clean up existing canned text
Existing unanswered questions and follow-ups whose text came from product code (the appended "Which roles did that come from?", "What in your background speaks to this?", the fallback why-this-company question, askForStory, keepCoaching, missingStarAsk) are regenerated by Harper once. Answered questions keep their text as history.
7. Bump the consultation prompt version to 20.
TESTS
- No product code writes, appends, or substitutes Harper's wording; each removed string is absent from live code paths.
- Quality checks regenerate and then accept; no question is dropped and no generation fails because of a quality check; raw seeker text is still never shown as Harper's result.
- A question missing its whoCaresNote after retries is kept and shown without it.
- Share some details runs extract and polish directly against the gap with no question created.
- A Partial gap's question states the supported evidence and asks only for the missing piece; the resulting statement combines both.
- Interviewer prep is a payload setting and never appears as a target, assessment, or gap.
- The loop guard prevents repeated reassessment for voice issues once the version is current.
- Existing unanswered canned questions are regenerated once; answered questions are unchanged.
- The why-this-company correction runs for existing sessions without Start.
REPORT
What changed for each item, real output for a Partial gap (the question, the seeker's added detail, and the combined statement), one Share some details result, one regenerated question that previously had canned text, the why-this-company correction on an in-progress session, files changed, and a full-suite result.

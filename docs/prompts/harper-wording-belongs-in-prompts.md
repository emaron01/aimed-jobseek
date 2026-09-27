SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PLAN ONLY. Do not change any code, configuration, schema, prompts, or data. Write the plan and stop. Coding starts only after the product owner approves it.

TASK: Write an implementation plan for the changes below, based on your audit of product code that writes, alters, filters, or substitutes Harper's text.

PRINCIPLE
Product code handles structure only: limits, duplicate prevention, gap and session state, what data each call receives, and saving results. All of Harper's wording comes from her prompts in src/lib/prompt-content/. The seeker's replies are stored exactly as typed. Nothing the seeker states is dropped or blocked.

CHANGES TO PLAN
1. Move every piece of Harper wording out of code and into her prompts; when the model omits something, regenerate, never substitute code text:
   - withRoleSourceAsk ("Which roles did that come from?")
   - defaultGapShareQuestion, the questionTextForGap why-this-company fallback, and the questionForGap whoCaresNote fallback
   - askForStory, keepCoaching, and missingStarAsk follow-ups (including followUpForMissingStar)
   - planAndStoreRound replacing the model's importantGaps with assessment text and the hardcoded "No remaining experience gaps..." sentence
   - personPrepFallbackOpening
   - personPrepFocus: send interviewer prep to the model as a setting, never as an assessable target
   - The follow-up body built as coaching plus follow-up question, which can show the same text twice
2. Stop changing or deleting the seeker's words:
   - Remove seekerWrittenReply from recordConsultationReply, editConsultationAnswer, and repairExistingConsultationSession, including the campaign.whyThisCompany rewrite. Replies are stored exactly as typed.
   - flagConsultationInaccuracy: record "not accurate" as a flag, not as a seeker turn with product text.
   - Remove the looksLikeCompanyMotivation and looksLikeWorkStory regex gates. The seeker's answer to the why-this-company question is their motivation.
3. Remove truth-police leftovers:
   - proposalsFromExtraction dropping "ungrounded" facts the seeker stated.
   - Unused validateCoachItems and validateSeekerVoice, if nothing live calls them.
4. Never block: plan and polish voice checks regenerate up to the existing retry limit, then accept the latest result instead of failing. Keep one exception: never show the seeker's raw reply as Harper's result (isRawSeekerResult).
5. Fix the source of third-person text: the extract step writes story fields and notes in third person ("The seeker was responsible..."). Change its instructions so those fields are first person or neutral.
6. Question layout on the Harper page: an answered question shows the question and Harper's results (statement, talk track, resume bullet) up front, with the seeker's own replies collapsed and expandable underneath. An unanswered question shows the reply box with Reply or Skip.
7. Evidence display: prefer Personal Profile facts over raw seeker replies by source type, not by the looksLikeRawSeekerNote regex.

THE PLAN MUST INCLUDE, for each change:
- The files and functions affected, and what each becomes.
- The exact prompt instruction to add or change, as text.
- Any schema change, and how it is safe on existing data.
- What happens to existing data, if anything.
- Risks, and anything that could break or change for the seeker.
- The tests that will prove it.

Also include: the order of work, anything in this list you believe is wrong or would cause harm (with reasons), and anything the audit found that this list does not cover.

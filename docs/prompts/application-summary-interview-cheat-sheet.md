# Consultation polished statements, Hiring Team organization, and Application Summary

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

Read docs/product-vision.md before starting. Follow the prompt content layer pattern in src/lib/prompt-content/. No product code may write narrative text; the model writes, product code validates, organizes, and lays out.

TASK: Three parts, done in order: (A) consultation polished statements and question quality, (B) Hiring Team organization, (C) the Application Summary interview cheat sheet. Work on main. Commit and push when all checks pass.

## PART A: Consultation add-on

### 1. Polished statements after every answer
After the seeker answers, Harper turns the answer into polished, professional statements the seeker can use, following the STAR structure hiring professionals expect:
- Interview answer: a clear Situation, Task, Action, Result version the seeker can say in about 60 to 90 seconds.
- Resume bullet: one line leading with the action and ending with the result or metric.

Rules:
- Use only facts from the seeker's answer and their Personal Profile FACT items. Never add a metric, scope, title, or outcome the seeker did not state. Product code verifies every fact and number in the statements against the answer and profile; unsupported content is removed and the statement is regenerated.
- If the answer lacks a Result, do not invent one. Harper says what is missing and asks a follow-up to get it.
- Polished means clear, specific, and professional in the seeker's own voice. No buzzwords or phrases that read as AI-written. Keep the banned phrase list in configuration (not in prompt text or code), starting with: "spearheaded", "leveraged", "synergies", "passionate about", "dynamic environment", "fast-paced", "results-driven", "proven track record", "thrilled", "delve", and em dashes. Product code checks every Harper output against the list, including questions and follow-ups, and regenerates on a hit.
- The seeker can edit, approve, or regenerate each statement. Approved statements are saved to the story bank alongside the verbatim answer and are available to later resume, cover letter, interview guide, and summary generation.

### 2. Buzzword requirements
When a requirement is vague or buzzword-heavy (for example, "strong strategic thinking and problem-solving skills with the ability to drive results in a fast-paced, dynamic environment"), Harper translates it into what the hiring manager actually means for this role and asks for concrete evidence of that. Harper never quotes the buzzword back to the seeker.

### 3. Who cares about this
The note explaining who will care about an answer names the specific Hiring Team role for this application and says what that person needs to hear, tied to their persona. Never generic statements such as "A posted role is screened before it reaches the hiring manager."

## PART B: Hiring Team organization
- Group the application's Hiring Team into two sections: Direct (involved in the hiring decision or interviews) first, then Indirect (cross-functional).
- Each role is collapsible and collapsed by default, showing its name, likely titles, and a one-line reason it is involved. Expanded, it shows the full persona.
- Expand all and collapse all controls for each section. The expanded or collapsed state does not need to persist.

## PART C: Application Summary (the interview cheat sheet)
A per-application summary page the seeker can review and print or save as PDF, clean and readable on paper.

Contents, in this order:
1. Company: what they do, customers, stage and size, recent news, hiring and growth signals, and employer risk signals worth knowing before an interview. Culture items are labeled as based on limited public evidence.
2. Position: title, reporting line, location and work arrangement, compensation as stated in the posting, mission, key outcomes, and competencies.
3. Where you shine: requirements assessed STRONG or PARTIAL, each with its approved polished statement or story when one exists.
4. Gaps and how to handle them: each remaining gap with Harper's strategy.
5. Hiring Team at a glance: Direct roles with their top talking points and likely concerns; Indirect roles with one line each on how the seeker's work would connect to theirs.
6. Harper's guidance: a short coaching summary, the questions the seeker should be ready to answer, and thoughtful questions to ask each Direct role.
7. Your stories: approved STAR interview answers, grouped by the competency they demonstrate.

Rules:
- Sections 1 through 5 and 7 are laid out from stored data (research, job requirement, assessments, personas, approved statements). Product code organizes them; it does not write narrative.
- Section 6 is written by the model in a single summary synthesis call, grounded in the stored data, following the claim rule (no fact about the seeker that is not in the Personal Profile or approved consultation answers) and the banned-phrase check. Add its content to src/lib/prompt-content/.
- Never include the seeker's Target Employer compensation targets. The posting's stated compensation may appear.
- Only approved polished statements appear; unapproved drafts do not.
- The summary shows when it was generated and is marked stale when the job requirement, research, Hiring Team, assessments, or approved statements change, with a Regenerate action. Section 6 is only regenerated when requested.
- A Print or Save as PDF action uses a dedicated print stylesheet: no navigation or buttons, readable typography, sensible page breaks, and collapsible content fully expanded.
- If the summary synthesis fails, show a clear status with a retry action. Never substitute code-written guidance.

## TESTS
- Polished statements contain no fact or number absent from the answer and the Personal Profile.
- An answer without a Result produces a follow-up, not an invented result.
- Harper output containing a configured banned phrase is regenerated; approved statements contain none.
- Buzzword requirements are translated into concrete questions and never quoted back.
- "Who cares" notes name a Hiring Team role from the application and are never generic.
- Approved statements persist in the story bank alongside the verbatim answer.
- Hiring Team renders Direct before Indirect, collapsed by default, with expand and collapse all.
- The summary excludes Target Employer compensation targets and unapproved statements.
- The summary goes stale when any source changes; Harper's guidance regenerates only on request.
- Summary synthesis failure shows retry and no substitute text.
- The print stylesheet hides navigation and controls and expands all content.

## REPORT
All sample output must come from real model calls, not fixtures or test doubles. Using the fixture resume and a Director of Enterprise Sales posting: the translated question for the strategic-thinking requirement, a sample seeker answer, the polished interview answer and resume bullet, a follow-up for an answer missing its result, and one "who cares" note. Then the full generated Application Summary for that application as text. Also prompt versions, migrations, files changed, and anything that could not meet this standard.

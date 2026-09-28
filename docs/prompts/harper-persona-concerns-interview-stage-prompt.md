# Prompt: Persona synthesis — keep interview stage out of candidateConcerns

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root cause. Do not filter, strip, or post-process model output in code to hide the defect. No temporary fixes, no data repair, no migrations.

SURGICAL RULE
Change only the persona synthesis prompt instruction described below and its test. Do not change any other prompt text, code, UI, field mapping, or behavior. Do not add features.

CONTEXT
Your previous report found that the model placed the interview stage ("Interview stage: hiring manager chronological walk-through") into candidateConcerns. Code maps candidateConcerns and interviewStage separately, and the UI already displays interviewStage on its own. The product owner approves a prompt change for this defect.

CHANGE
In persona-synthesis.ts, in the instruction for candidateConcerns, add this sentence immediately after the existing concerns instruction:
"candidateConcerns contains only this person's concerns about the seeker as a candidate. Never put the interview stage, involvement, or any other field's content in candidateConcerns; each of those has its own field."
Do not change any other wording in the prompt.

REPORT ONLY (no changes)
List every place that writes to profileJson.modelNote (or any field rendered in the same place in ApplicationWorkspace.tsx), with file paths, function names, and line numbers, and state for each whether its content is seeker-appropriate or internal system information. Make no changes for this item.

TESTS
Add a test that asserts the persona synthesis prompt contains the new candidateConcerns sentence exactly, so it cannot be removed silently. Run the full existing test suite and confirm it passes with no new failures.

REPORT
The exact prompt change (before and after of the concerns instruction), the test added, the full test suite result, and every file changed. Then the modelNote writer list. Confirm nothing else was changed.

# Prompt: Harper last-10-years and green-state rules (report only)

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

REPORT ONLY. Do not change any code, configuration, schema, prompts, or data.

TASK: Report whether these two Harper rules are already in place, and what would need to change if not.

1. Harper asks only about the last 10 years
The rule: the career walk-through question covers only roles held within the last 10 years from today's date; Harper never asks about roles that ended more than 10 years ago, in the walk-through or in any gap question; experience the seeker volunteers from an older role can still be used as evidence.
Report: whether Harper's instructions contain this rule today (quote the exact text if so), the current prompt version, and if missing, the exact instruction text you would add and where.

2. Harper green
The rule: Harper is green when every Harper question is answered. It goes back to yellow when new data presents (new questions, new gaps from reassessment, or new Harper results) until those questions are answered. Open gaps alone do not keep Harper yellow.
Report: the exact condition in code today that makes Harper green, yellow, or red (file and function), whether it includes any open-gaps condition, and if the rule is not met, exactly what would change.

For each item, conclude: already in place, or the change needed.

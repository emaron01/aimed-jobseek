# Hiring Team live synthesis report

REPORT ONLY unless a defect is found. .env.local now has the AI model configuration.

1. Using real model calls (not fixtures or test doubles), run Hiring Team identification and persona synthesis for the normal fixture posting, with company research if it can run locally. Show the identified roles and the full drafts for the Hiring Manager, the Reliability Lead, and the Recruiter, including which draft-quality checks passed or triggered a retry.
2. Confirm whether Hiring Team role identification itself is performed by the model or by product code. If any product code decides which roles exist or what their titles are (beyond enforcing guardrails such as using the posting's stated reporting line), report exactly what it does. Do not change it yet.
3. Do not write any API key to any file other than .env.local, and do not print keys in output.

import { describe, expect, it } from "vitest";
import {
  ACTIVE_RESEARCHED_COMPANY_WARN_REMAINING,
  formatResearchAllowanceExhausted,
  formatResearchAllowanceSummary,
  formatResearchAllowanceWarning,
  toActiveResearchedCompanyUsageView,
} from "@/lib/usage/research-allowance";

describe("research allowance view", () => {
  it("warns at 10 remaining and does not block", () => {
    const view = toActiveResearchedCompanyUsageView({ used: 90, limit: 100 });
    expect(view.remaining).toBe(ACTIVE_RESEARCHED_COMPANY_WARN_REMAINING);
    expect(view.warning).toBe(true);
    expect(view.exhausted).toBe(false);
    expect(formatResearchAllowanceWarning(view.remaining)).toMatch(/10/);
  });

  it("hard-stops at zero remaining", () => {
    const view = toActiveResearchedCompanyUsageView({ used: 100, limit: 100 });
    expect(view.remaining).toBe(0);
    expect(view.warning).toBe(false);
    expect(view.exhausted).toBe(true);
    expect(formatResearchAllowanceExhausted(100)).toMatch(/Billing/);
    expect(formatResearchAllowanceExhausted(100)).toMatch(/outreach drafts/);
    expect(formatResearchAllowanceExhausted(100)).not.toMatch(/\bsending\b/);
    expect(formatResearchAllowanceSummary(view)).toMatch(/used/);
  });

  it("stays quiet when well under the warning threshold", () => {
    const view = toActiveResearchedCompanyUsageView({ used: 20, limit: 100 });
    expect(view.remaining).toBe(80);
    expect(view.warning).toBe(false);
    expect(view.exhausted).toBe(false);
  });
});

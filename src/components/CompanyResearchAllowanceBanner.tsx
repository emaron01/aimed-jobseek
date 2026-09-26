import Link from "next/link";
import { ConvertTrialNowButton } from "@/components/billing/ConvertTrialNowButton";
import {
  formatResearchAllowanceSummary,
  formatResearchAllowanceWarning,
  formatResearchQuotaBlockedMessage,
  researchQuotaBlockedCta,
  type ActiveResearchedCompanyUsageView,
  type ResearchBillingContext,
} from "@/lib/usage/research-allowance";

export function CompanyResearchAllowanceBanner({
  usage,
  billing,
  compact = false,
}: {
  usage: ActiveResearchedCompanyUsageView;
  billing?: ResearchBillingContext | null;
  compact?: boolean;
}) {
  const cta = researchQuotaBlockedCta({
    billingStatus: billing?.billingStatus,
    planCode: billing?.planCode,
  });

  if (usage.exhausted) {
    return (
      <div
        className="rounded-md border border-danger bg-danger-tint px-3 py-2 text-sm text-danger"
        data-testid="research-allowance-exhausted"
      >
        <p className="font-medium">
          {formatResearchAllowanceSummary(usage)}
        </p>
        {!compact ? (
          <p className="mt-1">
            {formatResearchQuotaBlockedMessage({
              used: usage.used,
              limit: usage.limit,
              billingStatus: billing?.billingStatus,
              trialEndsAt: billing?.trialEndsAt,
              planCode: billing?.planCode,
            })}
          </p>
        ) : null}
        {billing?.canConvertTrialEarly ? (
          <div className="mt-2">
            <ConvertTrialNowButton />
          </div>
        ) : null}
        <p className="mt-2">
          <Link
            href={cta.href}
            className="font-medium underline underline-offset-2"
          >
            {cta.label}
          </Link>
        </p>
      </div>
    );
  }

  if (usage.warning) {
    return (
      <div
        className="rounded-md border border-warning bg-warning-tint px-3 py-2 text-sm text-warning"
        data-testid="research-allowance-warning"
      >
        <p className="font-medium">
          {formatResearchAllowanceSummary(usage)}
        </p>
        {!compact ? (
          <p className="mt-1">
            {formatResearchAllowanceWarning(usage.remaining)}
          </p>
        ) : null}
        <p className="mt-2">
          <Link
            href={cta.href}
            className="font-medium underline underline-offset-2"
          >
            {billing?.billingStatus === "TRIALING"
              ? "View Billing"
              : "Buy more in Billing"}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-md border border-edge bg-canvas px-3 py-2 text-sm text-ink"
      data-testid="research-allowance-ok"
    >
      <p className="font-medium">{formatResearchAllowanceSummary(usage)}</p>
      {!compact ? (
        <p className="mt-1 text-muted">
          One slot per distinct company with fresh research. Refreshing an
          already-researched company does not use another slot.
        </p>
      ) : null}
    </div>
  );
}

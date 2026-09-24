"use client";

import { useMemo, useState } from "react";
import { StartFreeTrialButton } from "@/components/billing/StartFreeTrialButton";
import { PRIMARY_BUTTON_CLASS } from "@/components/ui";
import {
  BILLING_PLAN_ENTERPRISE,
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_TEAM,
} from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { features, supportMailtoHref, vocab } from "@/lib/product-config";

export type OnboardingPlanOption = {
  planCode: string;
  displayName: string;
  tagline: string;
  featureBullets: string[];
  trialNote: string | null;
  priceLabel: string | null;
  creditsBulletNote: string | null;
};

export function OnboardingPlanSelector({
  standard,
  team,
  enterprise,
  standardTrialDays,
  teamTrialDays,
  standardCheckoutReady,
  teamCheckoutReady,
  globalDisabledReason,
  initialPlanCode = BILLING_PLAN_STANDARD,
  initialSeatQuantity = 2,
  lockSelection = false,
  supportEmail,
}: {
  standard: OnboardingPlanOption;
  team: OnboardingPlanOption;
  enterprise: OnboardingPlanOption;
  /** null = trial off for new Standard Checkout */
  standardTrialDays: number | null;
  /** null = trial off for new Team Checkout */
  teamTrialDays: number | null;
  standardCheckoutReady: boolean;
  teamCheckoutReady: boolean;
  globalDisabledReason?: string | null;
  initialPlanCode?: string;
  initialSeatQuantity?: number;
  /** When true, plan/seats were chosen at /signup/plan — confirm + checkout only. */
  lockSelection?: boolean;
  supportEmail: string;
}) {
  const [planCode, setPlanCode] = useState<string>(
    initialPlanCode === BILLING_PLAN_TEAM ||
      initialPlanCode === BILLING_PLAN_ENTERPRISE
      ? initialPlanCode
      : BILLING_PLAN_STANDARD,
  );
  const [seatQuantity, setSeatQuantity] = useState(
    Math.max(2, Math.min(10, Math.floor(initialSeatQuantity) || 2)),
  );

  const selected = useMemo(() => {
    if (planCode === BILLING_PLAN_TEAM) return team;
    if (planCode === BILLING_PLAN_ENTERPRISE) return enterprise;
    return standard;
  }, [enterprise, planCode, standard, team]);

  const selectedTrialDays =
    planCode === BILLING_PLAN_TEAM
      ? teamTrialDays
      : planCode === BILLING_PLAN_ENTERPRISE
        ? null
        : standardTrialDays;
  const trialOff = selectedTrialDays == null;

  const planDisabledReason =
    globalDisabledReason ??
    (planCode === BILLING_PLAN_STANDARD && !standardCheckoutReady
      ? "Standard checkout is not configured yet. Contact support if this persists."
      : planCode === BILLING_PLAN_TEAM && !teamCheckoutReady
        ? "Team checkout is not configured yet. Contact support if this persists."
        : null);

  return (
    <div className="space-y-6" data-testid="onboarding-plan-selector">
      {lockSelection ? null : (
        <div className="grid gap-3 md:grid-cols-3">
          {(
            [
              {
                code: BILLING_PLAN_STANDARD,
                label: "Standard",
                blurb: `For individual ${vocab.seeker.plural}`,
              },
              ...(features.teamPlanDisplay
                ? [
                    {
                      code: BILLING_PLAN_TEAM,
                      label: "Team",
                      blurb: "For teams of 2-10",
                    } as const,
                  ]
                : []),
              ...(features.enterprisePlanDisplay
                ? [
                    {
                      code: BILLING_PLAN_ENTERPRISE,
                      label: "Enterprise",
                      blurb: "For larger teams",
                    } as const,
                  ]
                : []),
            ] as const
          ).map((plan) => (
            <button
              key={plan.code}
              type="button"
              onClick={() => setPlanCode(plan.code)}
              className={cn(
                "rounded-lg border px-4 py-4 text-left transition",
                planCode === plan.code
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-900 hover:border-slate-400",
              )}
            >
              <p className="text-base font-semibold">{plan.label}</p>
              <p
                className={cn(
                  "mt-1 text-sm",
                  planCode === plan.code ? "text-slate-200" : "text-slate-600",
                )}
              >
                {plan.blurb}
              </p>
            </button>
          ))}
        </div>
      )}

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div>
          <p className="text-lg font-medium text-slate-900">
            {selected.displayName}
          </p>
          {planCode === BILLING_PLAN_TEAM ? (
            <p
              className="mt-2 text-xl font-extrabold tracking-tight text-emerald-600 sm:text-2xl"
              data-testid="onboarding-team-seats-selected"
            >
              You Have Selected {seatQuantity} Users For Your Team Account
            </p>
          ) : null}
          {selected.priceLabel ? (
            <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              {selected.priceLabel}
              {planCode === BILLING_PLAN_TEAM ? " / user / month" : null}
            </p>
          ) : null}
          {selected.tagline ? (
            <p className="mt-1 text-sm text-slate-600">{selected.tagline}</p>
          ) : null}
        </div>

        {features.teamSeats && planCode === BILLING_PLAN_TEAM && !lockSelection ? (
          <label className="block max-w-xs text-sm">
            <span className="font-medium text-slate-700">
              How many users? (minimum 2)
            </span>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              value={seatQuantity}
              onChange={(event) =>
                setSeatQuantity(Number.parseInt(event.target.value, 10))
              }
            >
              {Array.from({ length: 9 }, (_, index) => index + 2).map(
                (seats) => (
                  <option key={seats} value={seats}>
                    {seats} users
                  </option>
                ),
              )}
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              You can add users anytime after signup.
            </span>
          </label>
        ) : null}

        {planCode === BILLING_PLAN_TEAM && lockSelection ? (
          <p className="text-sm text-slate-600">
            You can add users anytime from organization settings.
          </p>
        ) : null}

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            What&apos;s included
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
            {selected.featureBullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
            {selected.creditsBulletNote &&
            !selected.featureBullets.some((b) =>
              b.toLowerCase().includes("company research credit"),
            ) ? (
              <li>{selected.creditsBulletNote}</li>
            ) : null}
          </ul>
          {!trialOff && planCode !== BILLING_PLAN_ENTERPRISE ? (
            <div
              className="mt-4 rounded-md border-2 border-emerald-500 bg-emerald-50 px-4 py-3"
              data-testid="onboarding-free-trial-banner"
            >
              <p className="text-lg font-extrabold tracking-wide text-emerald-700 sm:text-xl">
                FREE TRIAL — {selectedTrialDays} days
              </p>
              {selected.trialNote ? (
                <p className="mt-1 text-base font-semibold text-emerald-800">
                  {selected.trialNote}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <p className="text-sm text-slate-600">
          {planCode === BILLING_PLAN_ENTERPRISE
            ? "Contact us to get started."
            : trialOff
              ? "Once your subscription starts, you may cancel at any time. Active billing ends at the end of the most current billing cycle."
              : "Cancel anytime before your trial ends and you won\u2019t be charged. Once your subscription starts, you may cancel at any time. Active billing ends at the end of the most current billing cycle."}
        </p>

        {planCode === BILLING_PLAN_ENTERPRISE && features.contactSales ? (
          <a
            href={supportMailtoHref(supportEmail)}
            className={cn(PRIMARY_BUTTON_CLASS, "w-full !px-4 !py-3")}
            data-testid="onboarding-enterprise-contact"
          >
            Contact us
          </a>
        ) : planCode === BILLING_PLAN_ENTERPRISE ? null : (
          <StartFreeTrialButton
            disabledReason={planDisabledReason}
            trialPeriodDays={selectedTrialDays}
            planCode={planCode}
            seatQuantity={
              planCode === BILLING_PLAN_TEAM ? seatQuantity : 1
            }
            buttonLabel={
              planCode === BILLING_PLAN_TEAM
                ? trialOff
                  ? "Subscribe to Team"
                  : "Start Team free trial"
                : undefined
            }
          />
        )}
      </section>
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  setPendingSignupPlanAction,
  type PendingSignupActionResult,
} from "@/app/actions/pending-signup";
import { PRIMARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import {
  BILLING_PLAN_ENTERPRISE,
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_TEAM,
} from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { features, supportMailtoHref, vocab } from "@/lib/product-config";
const initial: PendingSignupActionResult | null = null;

export type SignupPlanOption = {
  planCode: string;
  displayName: string;
  tagline: string;
  featureBullets: string[];
  priceLabel: string | null;
  trialDays: number | null;
  trialNote: string | null;
};

export function SignupPlanSelector({
  standard,
  team,
  enterprise,
  supportEmail,
}: {
  standard: SignupPlanOption;
  team: SignupPlanOption;
  enterprise: SignupPlanOption;
  supportEmail: string;
}) {
  const [planCode, setPlanCode] = useState<string>(BILLING_PLAN_STANDARD);
  const [seatQuantity, setSeatQuantity] = useState(2);
  const [state, action, pending] = useActionState(
    setPendingSignupPlanAction,
    initial,
  );

  const selected =
    planCode === BILLING_PLAN_TEAM
      ? team
      : planCode === BILLING_PLAN_ENTERPRISE
        ? enterprise
        : standard;

  return (
    <div className="space-y-6" data-testid="signup-plan-selector">
      <div className="grid gap-3 md:grid-cols-3">
        {(
          [
            {
              code: BILLING_PLAN_STANDARD,
              label: standard.displayName,
              blurb: standard.tagline || `For individual ${vocab.seeker.plural}`,
            },
            ...(features.teamPlanDisplay
              ? [
                  {
                    code: BILLING_PLAN_TEAM,
                    label: team.displayName,
                    blurb: team.tagline || "For teams of 2-10",
                  } as const,
                ]
              : []),
            ...(features.enterprisePlanDisplay
              ? [
                  {
                    code: BILLING_PLAN_ENTERPRISE,
                    label: enterprise.displayName,
                    blurb: enterprise.tagline || "For larger teams",
                  } as const,
                ]
              : []),
          ] as const
        ).map((plan) => (
          <AppButton
            key={plan.code}
            type="button"
            onClick={() => setPlanCode(plan.code)}
            className={cn(
              "rounded-lg border px-4 py-4 text-left transition",
              planCode === plan.code
                ? "border-ink bg-ink text-on-ink"
                : "border-edge bg-surface text-ink hover:border-edge-strong",
            )}
          >
            <p className="text-base font-semibold">{plan.label}</p>
            <p
              className={cn(
                "mt-1 text-sm",
                planCode === plan.code ? "text-on-ink/80" : "text-muted",
              )}
            >
              {plan.blurb}
            </p>
          </AppButton>
        ))}
      </div>

      <section className="space-y-4 rounded-lg border border-edge bg-surface p-6">
        <div>
          <p className="text-lg font-medium text-ink">
            {selected.displayName}
          </p>
          {selected.priceLabel ? (
            <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
              {selected.priceLabel}
            </p>
          ) : null}
          {selected.tagline ? (
            <p className="mt-1 text-sm text-muted">{selected.tagline}</p>
          ) : null}
        </div>

        {features.teamSeats && planCode === BILLING_PLAN_TEAM ? (
          <label className="block max-w-xs text-sm">
            <span className="font-medium text-ink">
              How many users? (minimum 2)
            </span>
            <select
              className="mt-1 w-full rounded-md border border-edge-strong bg-surface px-3 py-2"
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
            <span className="mt-1 block text-xs text-subtle">
              You can add users anytime after signup.
            </span>
          </label>
        ) : null}

        {selected.trialDays != null &&
        planCode !== BILLING_PLAN_ENTERPRISE ? (
          <div className="rounded-md border-2 border-success bg-success-tint px-4 py-3">
            <p className="text-lg font-extrabold tracking-wide text-success sm:text-xl">
              FREE TRIAL — {selected.trialDays} days
            </p>
            {selected.trialNote ? (
              <p className="mt-1 text-base font-semibold text-success">
                {selected.trialNote}
              </p>
            ) : null}
          </div>
        ) : null}

        <ul className="list-disc space-y-2 pl-5 text-sm text-ink">
          {selected.featureBullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>

        {planCode === BILLING_PLAN_ENTERPRISE ? (
          <p className="text-sm text-muted">Contact us to get started.</p>
        ) : (
          <p className="text-sm text-muted">
            {selected.trialDays != null
              ? "Cancel anytime before your trial ends and you won\u2019t be charged. Once your subscription starts, you may cancel at any time. Active billing ends at the end of the most current billing cycle."
              : "Once your subscription starts, you may cancel at any time. Active billing ends at the end of the most current billing cycle."}
          </p>
        )}

        {planCode === BILLING_PLAN_ENTERPRISE && features.contactSales ? (
          <a
            href={supportMailtoHref(supportEmail)}
            className={cn(PRIMARY_BUTTON_CLASS, "w-full !px-4 !py-3")}
          >
            Contact us
          </a>
        ) : planCode === BILLING_PLAN_ENTERPRISE ? null : (
          <form action={action} className="space-y-3">
            <input type="hidden" name="planCode" value={planCode} />
            <input
              type="hidden"
              name="seatQuantity"
              value={
                planCode === BILLING_PLAN_TEAM ? String(seatQuantity) : "1"
              }
            />
            <AppButton
              type="submit"
              disabled={pending}
              className={cn(PRIMARY_BUTTON_CLASS, "w-full !px-4 !py-3")}
            >
              {pending ? "Continuing…" : "Continue to create account"}
            </AppButton>
            {state && !state.ok ? (
              <p className="text-sm text-danger" role="alert">
                {state.message}
              </p>
            ) : null}
          </form>
        )}
      </section>

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

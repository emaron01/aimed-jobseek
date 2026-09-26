"use client";

import { useActionState, useState } from "react";
import {
  updateBillingCatalogSettingAction,
  type PlatformSettingsActionResult,
} from "@/app/actions/platform-settings";
import type { CatalogPlanEntry } from "@/lib/billing/billing-catalog";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";

const initial: PlatformSettingsActionResult | null = null;

export function BillingCatalogSettingsForm({
  plans,
  sourceLabel,
  hasConsoleRow,
}: {
  plans: CatalogPlanEntry[];
  sourceLabel: string;
  hasConsoleRow: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateBillingCatalogSettingAction,
    initial,
  );
  const [selectedCode, setSelectedCode] = useState(
    plans.find((p) => p.planCode === "STANDARD")?.planCode ??
      plans[0]?.planCode ??
      "STANDARD",
  );
  const selected = plans.find((p) => p.planCode === selectedCode) ?? plans[0];

  if (!selected) {
    return <p className="text-sm text-muted">No catalog plans loaded.</p>;
  }

  const paid = selected.entitlementFloors.paid;
  const trial = selected.entitlementFloors.trial;
  const showSeatFields =
    selected.planCode === "TEAM" ||
    selected.planCode === "ENTERPRISE" ||
    selected.planCode === "PREMIUM";

  return (
    <div className="space-y-4" data-testid="billing-catalog-form">
      <p className="text-sm text-muted">
        Effective source: <span className="font-medium">{sourceLabel}</span>
        {hasConsoleRow ? " (console row present)" : " (code defaults)"}. Stripe
        Price IDs are edited on Billing Config — not here.
      </p>

      <div className="flex flex-wrap gap-2">
        {plans.map((p) => (
          <button
            key={p.planCode}
            type="button"
            onClick={() => setSelectedCode(p.planCode)}
            className={cn(
              p.planCode === selectedCode
                ? PRIMARY_BUTTON_CLASS
                : SECONDARY_BUTTON_CLASS,
              "!px-3",
              "!py-1.5",
            )}
          >
            {p.displayName}
            {p.planCode === "PREMIUM" ? " (legacy)" : ""}
            {!p.active ? " (inactive)" : ""}
          </button>
        ))}
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="intent" value="save" />
        <input type="hidden" name="planCode" value={selected.planCode} />
        <input
          type="hidden"
          name="otherPlansJson"
          value={JSON.stringify(
            plans.filter((p) => p.planCode !== selected.planCode),
          )}
        />

        <label className="block text-sm">
          Display name
          <input
            name="displayName"
            required
            defaultValue={selected.displayName}
            key={`${selected.planCode}-displayName`}
            className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Tagline
          <input
            name="tagline"
            defaultValue={selected.tagline}
            key={`${selected.planCode}-tagline`}
            className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Feature bullets (one per line)
          <textarea
            name="featureBullets"
            rows={6}
            defaultValue={selected.featureBullets.join("\n")}
            key={`${selected.planCode}-bullets`}
            className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 font-mono text-xs"
          />
        </label>
        <label className="block text-sm">
          Trial note
          <textarea
            name="trialNote"
            rows={3}
            defaultValue={selected.trialNote}
            key={`${selected.planCode}-trialNote`}
            className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="sellable"
              value="1"
              defaultChecked={selected.sellable}
              key={`${selected.planCode}-sellable`}
            />
            Sellable (Checkout)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              value="1"
              defaultChecked={selected.active}
              key={`${selected.planCode}-active`}
            />
            Active
          </label>
        </div>

        {showSeatFields ? (
          <fieldset className="space-y-2 rounded-md border border-edge p-3">
            <legend className="px-1 text-sm font-medium text-ink">
              Seat policy
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              <FloorInput
                name="companiesPerSeat"
                label="Companies per seat"
                defaultValue={paid.companiesPerSeat ?? 150}
                planCode={selected.planCode}
              />
              <FloorInput
                name="seatMin"
                label="Seat min"
                defaultValue={paid.seatMin ?? 2}
                planCode={selected.planCode}
              />
              <FloorInput
                name="seatMax"
                label="Seat max (blank = no global cap)"
                defaultValue={paid.seatMax ?? ""}
                planCode={selected.planCode}
                optional
              />
            </div>
          </fieldset>
        ) : (
          <>
            <input type="hidden" name="companiesPerSeat" value="" />
            <input type="hidden" name="seatMin" value="1" />
            <input type="hidden" name="seatMax" value="1" />
          </>
        )}

        <fieldset className="space-y-2 rounded-md border border-edge p-3">
          <legend className="px-1 text-sm font-medium text-ink">
            Paid entitlement floors
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <FloorInput
              name="paidCompanyResearchLimit"
              label={
                showSeatFields
                  ? "Company research limit (per user)"
                  : "Company research limit"
              }
              defaultValue={paid.companyResearchLimit}
              planCode={selected.planCode}
            />
            <FloorInput
              name="paidDailyEmailLimit"
              label="Daily email advisory"
              defaultValue={paid.dailyEmailLimit}
              planCode={selected.planCode}
            />
            <FloorInput
              name="paidMonthlyEmailLimit"
              label="Monthly email limit (blank = none)"
              defaultValue={paid.monthlyEmailLimit ?? ""}
              planCode={selected.planCode}
              optional
            />
            <FloorInput
              name="paidDailyAiGenerationLimit"
              label="Daily AI generations"
              defaultValue={paid.dailyAiGenerationLimit}
              planCode={selected.planCode}
            />
            <FloorInput
              name="paidResearchFreshnessDays"
              label="Research freshness (days)"
              defaultValue={paid.researchFreshnessDays}
              planCode={selected.planCode}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-2 rounded-md border border-edge p-3">
          <legend className="px-1 text-sm font-medium text-ink">
            Trial entitlement floors (optional)
          </legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="hasTrialFloors"
              value="1"
              defaultChecked={Boolean(trial)}
              key={`${selected.planCode}-hasTrial`}
            />
            Trial floors enabled
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <FloorInput
              name="trialCompanyResearchLimit"
              label="Company research limit"
              defaultValue={trial?.companyResearchLimit ?? ""}
              planCode={selected.planCode}
              optional
            />
            <FloorInput
              name="trialDailyEmailLimit"
              label="Daily email advisory"
              defaultValue={trial?.dailyEmailLimit ?? ""}
              planCode={selected.planCode}
              optional
            />
            <FloorInput
              name="trialMonthlyEmailLimit"
              label="Monthly email limit"
              defaultValue={trial?.monthlyEmailLimit ?? ""}
              planCode={selected.planCode}
              optional
            />
            <FloorInput
              name="trialDailyAiGenerationLimit"
              label="Daily AI generations"
              defaultValue={trial?.dailyAiGenerationLimit ?? ""}
              planCode={selected.planCode}
              optional
            />
            <FloorInput
              name="trialResearchFreshnessDays"
              label="Research freshness (days)"
              defaultValue={trial?.researchFreshnessDays ?? ""}
              planCode={selected.planCode}
              optional
            />
          </div>
        </fieldset>

        <fieldset className="space-y-2 rounded-md border border-edge p-3">
          <legend className="px-1 text-sm font-medium text-ink">
            Company credits
          </legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="hasCompanyCredits"
              value="1"
              defaultChecked={Boolean(selected.companyCredits)}
              key={`${selected.planCode}-hasCredits`}
            />
            Offer credit blocks on this plan
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <FloorInput
              name="creditsBlockSize"
              label="Block size (companies)"
              defaultValue={selected.companyCredits?.blockSize ?? 100}
              planCode={selected.planCode}
              optional
            />
            <FloorInput
              name="creditsExpiryMonths"
              label="Expiry (months)"
              defaultValue={selected.companyCredits?.expiryMonths ?? 12}
              planCode={selected.planCode}
              optional
            />
          </div>
          <label className="block text-sm">
            Display price note (optional; leave blank to use Stripe amount)
            <input
              name="creditsDisplayPriceNote"
              defaultValue={selected.companyCredits?.displayPriceNote ?? ""}
              key={`${selected.planCode}-creditsNote`}
              className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            />
          </label>
          <p className="text-xs text-subtle">
            Credit Price ID is configured on Billing Config.
          </p>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending}
            className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
          >
            {pending ? "Saving…" : `Save ${selected.displayName}`}
          </button>
        </div>
        {state?.message ? (
          <p
            className={
              state.ok ? "text-sm text-success" : "text-sm text-danger"
            }
            role="status"
          >
            {state.message}
          </p>
        ) : null}
      </form>

      <form action={action}>
        <input type="hidden" name="intent" value="clear" />
        <button
          type="submit"
          disabled={pending || !hasConsoleRow}
          className={cn(SECONDARY_BUTTON_CLASS, "!px-3")}
        >
          Clear console catalog (use code defaults)
        </button>
      </form>
    </div>
  );
}

function FloorInput({
  name,
  label,
  defaultValue,
  planCode,
  optional,
}: {
  name: string;
  label: string;
  defaultValue: number | string;
  planCode: string;
  optional?: boolean;
}) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <input
        name={name}
        type="number"
        min={0}
        defaultValue={defaultValue}
        key={`${planCode}-${name}`}
        className="mt-1 w-full rounded-md border border-edge-strong px-2 py-1.5 text-sm"
        {...(optional ? {} : { required: true })}
      />
    </label>
  );
}

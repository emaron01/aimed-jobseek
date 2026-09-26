"use client";

import { useActionState } from "react";
import {
  updateBillingPricesSettingAction,
  type PlatformSettingsActionResult,
} from "@/app/actions/platform-settings";
import { PrimaryButton, SecondaryButton } from "@/components/ui";

const initial: PlatformSettingsActionResult | null = null;

type FieldView = {
  value: string | null;
  sourceLabel: string;
};

export function BillingPricesSettingsForm({
  consoleStandardMonthlyPriceId,
  consoleStandardProductId,
  consoleCompanyCreditsPriceId,
  consoleTeamMonthlyPriceId,
  consoleTeamProductId,
  consoleEnterpriseMonthlyPriceId,
  consoleEnterpriseProductId,
  hasConsoleRow,
  effective,
}: {
  consoleStandardMonthlyPriceId: string | null;
  consoleStandardProductId: string | null;
  consoleCompanyCreditsPriceId: string | null;
  consoleTeamMonthlyPriceId: string | null;
  consoleTeamProductId: string | null;
  consoleEnterpriseMonthlyPriceId: string | null;
  consoleEnterpriseProductId: string | null;
  hasConsoleRow: boolean;
  effective: {
    standardMonthlyPriceId: FieldView;
    standardProductId: FieldView;
    companyCreditsPriceId: FieldView;
    teamMonthlyPriceId: FieldView;
    teamProductId: FieldView;
    enterpriseMonthlyPriceId: FieldView;
    enterpriseProductId: FieldView;
  };
}) {
  const [state, formAction, pending] = useActionState(
    updateBillingPricesSettingAction,
    initial,
  );

  return (
    <div className="space-y-4" data-testid="billing-prices-settings">
      <div className="space-y-2 rounded-md border border-edge bg-canvas px-3 py-2 text-sm text-ink">
        <p className="font-medium">Effective Stripe IDs (new Checkout)</p>
        <ul className="space-y-1 text-ink">
          <EffectiveRow
            label="Standard monthly price"
            field={effective.standardMonthlyPriceId}
            hasConsoleRow={hasConsoleRow}
          />
          <EffectiveRow
            label="Standard product"
            field={effective.standardProductId}
            hasConsoleRow={hasConsoleRow}
          />
          <EffectiveRow
            label="Company credits price"
            field={effective.companyCreditsPriceId}
            hasConsoleRow={hasConsoleRow}
          />
          <EffectiveRow
            label="Team monthly price"
            field={effective.teamMonthlyPriceId}
            hasConsoleRow={hasConsoleRow}
          />
          <EffectiveRow
            label="Team product"
            field={effective.teamProductId}
            hasConsoleRow={hasConsoleRow}
          />
          <EffectiveRow
            label="Enterprise monthly price"
            field={effective.enterpriseMonthlyPriceId}
            hasConsoleRow={hasConsoleRow}
          />
          <EffectiveRow
            label="Enterprise product"
            field={effective.enterpriseProductId}
            hasConsoleRow={hasConsoleRow}
          />
        </ul>
        <p className="mt-2 text-xs text-subtle">
          Changes apply only to new Checkout sessions. Existing subscribers keep
          the Price already stored on their Stripe subscription. Plan copy and
          entitlement floors are edited on Plan Catalog — not here.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="intent" value="save" />
        <fieldset className="space-y-3 rounded-md border border-edge p-3">
          <legend className="px-1 text-sm font-medium">Standard</legend>
          <IdInput
            name="standardMonthlyPriceId"
            label="Standard monthly price ID"
            required
            defaultValue={
              consoleStandardMonthlyPriceId ??
              effective.standardMonthlyPriceId.value ??
              ""
            }
          />
          <IdInput
            name="standardProductId"
            label="Standard product ID"
            required
            defaultValue={
              consoleStandardProductId ??
              effective.standardProductId.value ??
              ""
            }
            hint="Referral coupons scope to this product via applies_to."
          />
          <IdInput
            name="companyCreditsPriceId"
            label="Company credits price ID"
            required
            defaultValue={
              consoleCompanyCreditsPriceId ??
              effective.companyCreditsPriceId.value ??
              ""
            }
          />
        </fieldset>

        <fieldset className="space-y-3 rounded-md border border-edge p-3">
          <legend className="px-1 text-sm font-medium">Team (placeholders OK)</legend>
          <IdInput
            name="teamMonthlyPriceId"
            label="Team monthly price ID"
            defaultValue={
              consoleTeamMonthlyPriceId ??
              effective.teamMonthlyPriceId.value ??
              ""
            }
          />
          <IdInput
            name="teamProductId"
            label="Team product ID"
            defaultValue={
              consoleTeamProductId ?? effective.teamProductId.value ?? ""
            }
          />
        </fieldset>

        <fieldset className="space-y-3 rounded-md border border-edge p-3">
          <legend className="px-1 text-sm font-medium">
            Enterprise (placeholders OK)
          </legend>
          <IdInput
            name="enterpriseMonthlyPriceId"
            label="Enterprise monthly price ID"
            defaultValue={
              consoleEnterpriseMonthlyPriceId ??
              effective.enterpriseMonthlyPriceId.value ??
              ""
            }
          />
          <IdInput
            name="enterpriseProductId"
            label="Enterprise product ID"
            defaultValue={
              consoleEnterpriseProductId ??
              effective.enterpriseProductId.value ??
              ""
            }
          />
        </fieldset>

        {state ? (
          <p
            role="status"
            data-testid="billing-prices-settings-status"
            className={
              state.ok ? "text-sm text-success" : "text-sm text-danger"
            }
          >
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? "Validating with Stripe…" : "Save price IDs"}
          </PrimaryButton>
        </div>
      </form>

      {hasConsoleRow ? (
        <form action={formAction}>
          <input type="hidden" name="intent" value="clear" />
          <SecondaryButton type="submit" disabled={pending}>
            Clear console override (use environment)
          </SecondaryButton>
        </form>
      ) : null}
    </div>
  );
}

function EffectiveRow({
  label,
  field,
  hasConsoleRow,
}: {
  label: string;
  field: FieldView;
  hasConsoleRow: boolean;
}) {
  return (
    <li>
      <span className="font-medium">{label}:</span>{" "}
      <code className="break-all text-xs">{field.value ?? "—"}</code>
      <span className="mt-0.5 block text-xs text-subtle">
        Source: {field.sourceLabel}
        {hasConsoleRow ? "" : " (no console override)"}
      </span>
    </li>
  );
}

function IdInput({
  name,
  label,
  defaultValue,
  required,
  hint,
}: {
  name: string;
  label: string;
  defaultValue: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-ink">{label}</span>
      <input
        type="text"
        name={name}
        required={required}
        spellCheck={false}
        defaultValue={defaultValue}
        placeholder="price_… / prod_…"
        className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 font-mono text-sm"
      />
      {hint ? (
        <span className="mt-1 block text-xs text-subtle">{hint}</span>
      ) : null}
    </label>
  );
}

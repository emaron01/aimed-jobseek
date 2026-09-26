"use client";

import { useActionState } from "react";
import {
  updateBillingTrialSettingAction,
  type PlatformSettingsActionResult,
} from "@/app/actions/platform-settings";
import {
  MAX_TRIAL_PERIOD_DAYS,
  MIN_TRIAL_PERIOD_DAYS,
} from "@/lib/billing/trial-period";
import { PrimaryButton, SecondaryButton } from "@/components/ui";

const initial: PlatformSettingsActionResult | null = null;

type PlanTrialView = {
  enabled: boolean;
  days: number;
  effectiveDays: number | null;
  sourceLabel: string;
};

export function BillingTrialSettingsForm({
  standard,
  team,
  hasConsoleRow,
}: {
  standard: PlanTrialView;
  team: PlanTrialView;
  hasConsoleRow: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateBillingTrialSettingAction,
    initial,
  );

  return (
    <div className="space-y-4" data-testid="billing-trial-settings">
      <p className="text-xs text-subtle">
        Changes apply only to new Checkout sessions. Orgs already on a trial
        keep their Stripe trial end date.
      </p>

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="intent" value="save" />

        <PlanTrialFields
          planLabel="Standard"
          namePrefix="standard"
          defaultEnabled={standard.enabled}
          defaultDays={standard.days}
          effectiveDays={standard.effectiveDays}
          sourceLabel={standard.sourceLabel}
          hasConsoleRow={hasConsoleRow}
        />

        <PlanTrialFields
          planLabel="Team"
          namePrefix="team"
          defaultEnabled={team.enabled}
          defaultDays={team.days}
          effectiveDays={team.effectiveDays}
          sourceLabel={team.sourceLabel}
          hasConsoleRow={hasConsoleRow}
        />

        {state ? (
          <p
            role="status"
            data-testid="billing-trial-settings-status"
            className={
              state.ok ? "text-sm text-success" : "text-sm text-danger"
            }
          >
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save trial settings"}
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

function PlanTrialFields({
  planLabel,
  namePrefix,
  defaultEnabled,
  defaultDays,
  effectiveDays,
  sourceLabel,
  hasConsoleRow,
}: {
  planLabel: string;
  namePrefix: "standard" | "team";
  defaultEnabled: boolean;
  defaultDays: number;
  effectiveDays: number | null;
  sourceLabel: string;
  hasConsoleRow: boolean;
}) {
  const effectiveLabel =
    effectiveDays == null
      ? `Trial off for new ${planLabel} Checkout`
      : `${effectiveDays}-day trial on new ${planLabel} Checkout`;

  return (
    <fieldset className="space-y-3 rounded-md border border-edge p-3">
      <legend className="px-1 text-sm font-medium text-ink">
        {planLabel} free trial
      </legend>

      <div className="rounded-md border border-edge bg-canvas px-3 py-2 text-sm text-ink">
        <p className="font-medium">{effectiveLabel}</p>
        <p className="mt-0.5 text-muted">
          Source: {sourceLabel}
          {hasConsoleRow ? "" : " (no console override)"}
        </p>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="radio"
            name={`${namePrefix}Enabled`}
            value="1"
            defaultChecked={defaultEnabled}
          />
          On
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="radio"
            name={`${namePrefix}Enabled`}
            value="0"
            defaultChecked={!defaultEnabled}
          />
          Off
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-ink">Duration (days)</span>
        <input
          type="number"
          name={`${namePrefix}Days`}
          min={MIN_TRIAL_PERIOD_DAYS}
          max={MAX_TRIAL_PERIOD_DAYS}
          defaultValue={defaultDays}
          className="mt-1 w-32 rounded-md border border-edge-strong px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-xs text-subtle">
          Required when trial is on ({MIN_TRIAL_PERIOD_DAYS}–
          {MAX_TRIAL_PERIOD_DAYS}).
        </span>
      </label>
    </fieldset>
  );
}

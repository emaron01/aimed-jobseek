"use client";

import { useState } from "react";
import { StartFreeTrialButton } from "@/components/billing/StartFreeTrialButton";
import {AppButton, AppActionLink } from "@/components/ui";
import type { CatalogPlanEntry } from "@/lib/billing/billing-catalog";
import { cn } from "@/lib/utils";
import { features, supportMailtoHref, vocab } from "@/lib/product-config";

export function PlanSelector({
  plans,
  trialPeriodDays,
  disabledReason,
  priceLabels,
  supportEmail,
}: {
  plans: CatalogPlanEntry[];
  trialPeriodDays: number | null;
  disabledReason?: string | null;
  priceLabels: Record<string, string | null>;
  supportEmail: string;
}) {
  const standard =
    plans.find((p) => p.planCode === "STANDARD" && p.active) ?? null;
  const team = plans.find((p) => p.planCode === "TEAM" && p.active) ?? null;
  const enterprise =
    plans.find((p) => p.planCode === "ENTERPRISE" && p.active) ?? null;

  const [selected, setSelected] = useState<"STANDARD" | "TEAM" | "ENTERPRISE">(
    "STANDARD",
  );
  const [seats, setSeats] = useState(2);

  const selectedPlan =
    selected === "TEAM"
      ? team
      : selected === "ENTERPRISE"
        ? enterprise
        : standard;

  return (
    <div className="space-y-6" data-testid="onboarding-plan-selector">
      <div className="grid gap-3 sm:grid-cols-3">
        {standard ? (
          <PlanCard
            selected={selected === "STANDARD"}
            onSelect={() => setSelected("STANDARD")}
            title={standard.displayName}
            tagline={standard.tagline || `For individual ${vocab.seeker.plural}`}
            priceLabel={priceLabels.STANDARD}
          />
        ) : null}
        {features.teamPlanDisplay && team ? (
          <PlanCard
            selected={selected === "TEAM"}
            onSelect={() => setSelected("TEAM")}
            title={team.displayName}
            tagline={team.tagline || "For teams of 2-10"}
            priceLabel={priceLabels.TEAM}
          />
        ) : null}
        {features.enterprisePlanDisplay && enterprise ? (
          <PlanCard
            selected={selected === "ENTERPRISE"}
            onSelect={() => setSelected("ENTERPRISE")}
            title={enterprise.displayName}
            tagline={enterprise.tagline || "For larger teams"}
            priceLabel={null}
          />
        ) : null}
      </div>

      {selectedPlan ? (
        <div className="space-y-3 rounded-lg border border-edge bg-surface p-4">
          <h2 className="text-lg font-medium text-ink">
            {selectedPlan.displayName}
          </h2>
          <p className="text-sm text-muted">{selectedPlan.tagline}</p>
          {selectedPlan.featureBullets.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
              {selectedPlan.featureBullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
          {selectedPlan.trialNote && selected !== "ENTERPRISE" ? (
            <div className="mt-3 rounded-md border-2 border-success bg-success-tint px-4 py-3">
              <p className="text-lg font-extrabold tracking-wide text-success sm:text-xl">
                FREE TRIAL
              </p>
              <p className="mt-1 text-base font-semibold text-success">
                {selectedPlan.trialNote}
              </p>
            </div>
          ) : null}

          {features.teamSeats && selected === "TEAM" ? (
            <label className="block text-sm text-ink">
              Seats (2–10)
              <select
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
                value={seats}
                onChange={(e) => setSeats(Number(e.target.value))}
              >
                {Array.from({ length: 9 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {n} seats
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {selected === "ENTERPRISE" && features.contactSales ? (
            <AppActionLink
              href={supportMailtoHref(supportEmail)}
              variant="primary" className={cn("w-full !px-4 !py-3")}
            >
              Contact us
            </AppActionLink>
          ) : selected === "ENTERPRISE" ? null : (
            <StartFreeTrialButton
              disabledReason={disabledReason}
              trialPeriodDays={trialPeriodDays}
              planCode={selected}
              seatQuantity={selected === "TEAM" ? seats : 1}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function PlanCard({
  selected,
  onSelect,
  title,
  tagline,
  priceLabel,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  tagline: string;
  priceLabel: string | null;
}) {
  return (
    <AppButton
      type="button"
      onClick={onSelect}
      className={`rounded-lg border px-4 py-3 text-left transition ${
        selected
          ? "border-ink bg-canvas ring-1 ring-ink"
          : "border-edge bg-surface hover:border-edge-strong"
      }`}
    >
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-1 text-xs text-muted">{tagline}</p>
      {priceLabel ? (
        <p className="mt-2 text-sm font-medium text-ink">{priceLabel}</p>
      ) : null}
    </AppButton>
  );
}

"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  updateManualCompanyResearchAction,
  type ResearchActionResult,
} from "@/app/actions/research";
import { Field, SubmitButton } from "@/components/ui";
import { vocab } from "@/lib/product-config";

function listToText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map(String).filter(Boolean).join("\n");
}

const initial: ResearchActionResult | null = null;

export function ManualCompanyResearchForm({
  companyId,
  defaults,
}: {
  companyId: string;
  defaults: {
    companySummary: string | null;
    whatTheySell: string | null;
    estimatedAov: string | null;
    aovReasoning: string | null;
    customerTypes: unknown;
    primaryMarkets: unknown;
    businessModel: string | null;
    companySizeContext: string | null;
    relevantTechnologies: unknown;
    buyingSignals: unknown;
    riskSignals: unknown;
  };
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateManualCompanyResearchAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      {state ? (
        <p
          role="status"
          data-testid="manual-research-status"
          className={
            state.ok
              ? "md:col-span-2 text-sm text-emerald-700"
              : "md:col-span-2 text-sm text-red-600"
          }
        >
          {state.message}
        </p>
      ) : null}
      <input type="hidden" name="companyId" value={companyId} />
      <div className="md:col-span-2">
        <Field
          label="Company Summary"
          name="companySummary"
          as="textarea"
          defaultValue={defaults.companySummary}
        />
      </div>
      <div className="md:col-span-2">
        <Field
          label="What They Sell"
          name="whatTheySell"
          as="textarea"
          defaultValue={defaults.whatTheySell}
        />
      </div>
      <Field
        label="Estimated AOV"
        name="estimatedAov"
        placeholder="$25K–$75K"
        defaultValue={defaults.estimatedAov}
      />
      <div className="md:col-span-2">
        <Field
          label="AOV Reasoning"
          name="aovReasoning"
          as="textarea"
          defaultValue={defaults.aovReasoning}
        />
      </div>
      <Field
        label={`${vocab.customer.Singular} Types (one per line)`}
        name="customerTypes"
        as="textarea"
        defaultValue={listToText(defaults.customerTypes)}
      />
      <Field
        label="Primary Markets (one per line)"
        name="primaryMarkets"
        as="textarea"
        defaultValue={listToText(defaults.primaryMarkets)}
      />
      <Field
        label="Business Model"
        name="businessModel"
        defaultValue={defaults.businessModel}
      />
      <Field
        label="Company Size Context"
        name="companySizeContext"
        as="textarea"
        defaultValue={defaults.companySizeContext}
      />
      <Field
        label="Relevant Technologies (one per line)"
        name="relevantTechnologies"
        as="textarea"
        defaultValue={listToText(defaults.relevantTechnologies)}
      />
      <Field
        label="Hiring and growth signals (one per line)"
        name="buyingSignals"
        as="textarea"
        defaultValue={listToText(defaults.buyingSignals)}
      />
      <div className="md:col-span-2">
        <Field
          label="Risk Signals (one per line)"
          name="riskSignals"
          as="textarea"
          defaultValue={listToText(defaults.riskSignals)}
        />
      </div>
      <div className="md:col-span-2">
        <SubmitButton disabled={pending}>
          {pending ? "Saving…" : "Save Manual Research"}
        </SubmitButton>
        <p className="mt-2 text-xs text-slate-500">
          Manual edits are marked MANUAL (or HYBRID if automated research
          existed). Do not invent facts without sources.
        </p>
      </div>
    </form>
  );
}

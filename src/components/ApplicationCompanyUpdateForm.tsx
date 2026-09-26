"use client";

import { updateApplicationCompanyInformationAction } from "@/app/actions/application";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { applicationWorkspaceCopy } from "@/lib/product-config";

function listToText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map(String).filter(Boolean).join("\n");
}

const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";

function TextField({
  name,
  label,
  defaultValue,
  rows,
}: {
  name: string;
  label: string;
  defaultValue: string;
  rows?: number;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-ink">{label}</span>
      {rows ? (
        <textarea name={name} rows={rows} defaultValue={defaultValue} className={fieldClass} />
      ) : (
        <input name={name} defaultValue={defaultValue} className={fieldClass} />
      )}
    </label>
  );
}

export function ApplicationCompanyUpdateForm({
  campaignId,
  companyName,
  defaults,
}: {
  campaignId: string;
  companyName: string | null;
  defaults: {
    companySummary: string | null;
    whatTheySell: string | null;
    businessModel: string | null;
    companySizeContext: string | null;
    estimatedAov: string | null;
    aovReasoning: string | null;
    customerTypes: unknown;
    primaryMarkets: unknown;
    relevantTechnologies: unknown;
    buyingSignals: unknown;
    hiringSignals: unknown;
    riskSignals: unknown;
  };
}) {
  return (
    <section className="space-y-3" data-testid="company-update">
      <div>
        <h3 className="text-sm font-semibold text-ink">
          {applicationWorkspaceCopy.companyUpdateTitle}
        </h3>
        <p className="mt-1 text-sm text-muted">
          {applicationWorkspaceCopy.companyUpdateHelp}
        </p>
      </div>
      <ApplicationActionForm
        action={updateApplicationCompanyInformationAction}
        submitLabel={applicationWorkspaceCopy.companyUpdateSave}
        testId="company-update-form"
      >
        <input type="hidden" name="campaignId" value={campaignId} />
        <TextField
          name="companyName"
          label={applicationWorkspaceCopy.fieldEmployer}
          defaultValue={companyName ?? ""}
        />
        <TextField
          name="companySummary"
          label={applicationWorkspaceCopy.fieldCompanySummary}
          defaultValue={defaults.companySummary ?? ""}
          rows={4}
        />
        <TextField
          name="whatTheySell"
          label={applicationWorkspaceCopy.fieldProducts}
          defaultValue={defaults.whatTheySell ?? ""}
          rows={3}
        />
        <TextField
          name="businessModel"
          label={applicationWorkspaceCopy.fieldBusinessModel}
          defaultValue={defaults.businessModel ?? ""}
        />
        <TextField
          name="hiringSignals"
          label={applicationWorkspaceCopy.fieldHiringGrowth}
          defaultValue={listToText(defaults.hiringSignals)}
          rows={3}
        />
        <TextField
          name="riskSignals"
          label={applicationWorkspaceCopy.fieldEmployerRisk}
          defaultValue={listToText(defaults.riskSignals)}
          rows={3}
        />
        <TextField
          name="customerTypes"
          label={applicationWorkspaceCopy.fieldCustomerTypes}
          defaultValue={listToText(defaults.customerTypes)}
          rows={3}
        />
        <TextField
          name="primaryMarkets"
          label={applicationWorkspaceCopy.fieldPrimaryMarkets}
          defaultValue={listToText(defaults.primaryMarkets)}
          rows={3}
        />
        <TextField
          name="companySizeContext"
          label={applicationWorkspaceCopy.fieldCompanySize}
          defaultValue={defaults.companySizeContext ?? ""}
          rows={2}
        />
        <TextField
          name="estimatedAov"
          label={applicationWorkspaceCopy.fieldEstimatedAov}
          defaultValue={defaults.estimatedAov ?? ""}
        />
        <TextField
          name="aovReasoning"
          label={applicationWorkspaceCopy.fieldAovReasoning}
          defaultValue={defaults.aovReasoning ?? ""}
          rows={2}
        />
        <TextField
          name="relevantTechnologies"
          label={applicationWorkspaceCopy.fieldTechnologies}
          defaultValue={listToText(defaults.relevantTechnologies)}
          rows={3}
        />
        <TextField
          name="buyingSignals"
          label={applicationWorkspaceCopy.fieldBuyingSignals}
          defaultValue={listToText(defaults.buyingSignals)}
          rows={3}
        />
      </ApplicationActionForm>
    </section>
  );
}

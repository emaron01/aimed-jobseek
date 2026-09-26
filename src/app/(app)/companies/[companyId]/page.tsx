import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyResearchBriefing } from "@/components/CompanyResearchBriefing";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import {
  getCompany,
  researchStatusLabel,
} from "@/lib/tenant/companies";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { formatDate, formatNumber } from "@/lib/utils";
import type { ResearchSource } from "@/lib/research";
import { hasUsableCompanyResearchFields } from "@/lib/research/freshness";
import { vocab } from "@/lib/product-config";

type PageProps = {
  params: Promise<{ companyId: string }>;
};

export default async function CompanyResearchPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const { companyId } = await params;

  if (!organization) {
    return (
      <div>
        <PageHeader title="Company" description="Company research." />
        <TenantMissing />
      </div>
    );
  }

  let company;
  try {
    company = await getCompany(companyId);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  const latest = company.research[0] ?? null;
  const sources = Array.isArray(latest?.researchSources)
    ? (latest.researchSources as ResearchSource[])
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div data-print-hide>
        <PageHeader
          title="Company briefing"
          description={`Employer research for this ${vocab.campaign.singular}. ${vocab.product.Singular}/${vocab.icp.singular} fit is scored separately.`}
          actions={
            <Link
              href="/campaigns"
              className={SECONDARY_BUTTON_CLASS}
            >
              Back to {vocab.campaign.plural}
            </Link>
          }
        />
      </div>

      <section className="rounded-lg border border-edge bg-surface p-5 sm:p-8">
        <CompanyResearchBriefing
          companyId={company.id}
          companyName={company.name}
          meta={{
            domain: company.normalizedDomain ?? company.website,
            industry: company.industry,
            location: company.location,
            employeeCount:
              company.employeeCount != null
                ? formatNumber(company.employeeCount)
                : null,
            revenue:
              company.revenue != null ? String(company.revenue) : null,
            lastResearched: latest?.researchedAt
              ? formatDate(latest.researchedAt)
              : null,
          }}
          defaults={{
            companySummary: latest?.companySummary ?? null,
            whatTheySell: latest?.whatTheySell ?? null,
            estimatedAov: latest?.estimatedAov ?? null,
            aovReasoning: latest?.aovReasoning ?? null,
            customerTypes: latest?.customerTypes,
            primaryMarkets: latest?.primaryMarkets,
            businessModel: latest?.businessModel ?? null,
            companySizeContext: latest?.companySizeContext ?? null,
            relevantTechnologies: latest?.relevantTechnologies,
            buyingSignals: latest?.buyingSignals,
            riskSignals: latest?.riskSignals,
          }}
          sources={sources}
          researchMethod={latest?.researchMethod ?? null}
          identityAmbiguous={latest?.identityAmbiguous ?? false}
          researchStatus={
            latest &&
            (latest.status === "COMPLETED" || latest.status === "PARTIAL")
              ? hasUsableCompanyResearchFields(latest)
                ? "Researched"
                : "No usable details found"
              : researchStatusLabel(latest?.status)
          }
        />
      </section>
    </div>
  );
}

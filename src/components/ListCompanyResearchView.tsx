import { SECONDARY_BUTTON_CLASS } from "@/components/ui";
import Link from "next/link";
import { RefreshCompanyResearchForm } from "@/components/RefreshCompanyResearchForm";
import { SuppressContactForm } from "@/components/SuppressContactForm";
import type { ContactListCompanyGroup } from "@/lib/tenant/companies";
import {
  hasUsableCompanyResearchFields,
  parseStringArray,
} from "@/lib/research/freshness";
import { contactMatchesSuppressionSet } from "@/lib/suppression/service";
import { cn, contactDisplayName, formatNumber } from "@/lib/utils";
import type { CompanyResearch } from "@prisma/client";
import { vocab } from "@/lib/product-config";

function hasResearchSummary(research: CompanyResearch | null): boolean {
  if (!research) return false;
  if (research.status !== "COMPLETED" && research.status !== "PARTIAL") {
    return false;
  }
  return Boolean(
    research.whatTheySell?.trim() ||
      parseStringArray(research.customerTypes).length > 0 ||
      parseStringArray(research.buyingSignals).length > 0 ||
      research.companySummary?.trim(),
  );
}

function formatCustomerAudience(research: CompanyResearch): string | null {
  const customerTypes = parseStringArray(research.customerTypes);
  if (customerTypes.length > 0) {
    return customerTypes.slice(0, 2).join(" · ");
  }
  const markets = parseStringArray(research.primaryMarkets);
  if (markets.length > 0) {
    return markets.slice(0, 2).join(" · ");
  }
  return null;
}

function firstBuyingSignal(research: CompanyResearch): string | null {
  const signals = parseStringArray(research.buyingSignals);
  return signals[0] ?? null;
}

function compactQualifiers(group: ContactListCompanyGroup, showIndustry: boolean) {
  const parts: string[] = [];
  if (showIndustry && group.industry?.trim()) {
    parts.push(group.industry.trim());
  }
  if (group.employeeCount != null) {
    parts.push(`${formatNumber(group.employeeCount)} employees`);
  }
  if (group.revenue != null) {
    parts.push(`$${formatNumber(group.revenue)} revenue`);
  }
  return parts;
}

export function ListCompanyResearchView({
  groups,
  contactListId,
  showIndustry,
  listArchived,
  readOnly,
  suppressedEmails,
}: {
  groups: ContactListCompanyGroup[];
  contactListId: string;
  showIndustry: boolean;
  listArchived: boolean;
  readOnly: boolean;
  suppressedEmails: Set<string>;
}) {
  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const qualifiers = compactQualifiers(group, showIndustry);
        const research = group.latestResearch;
        const showSummary = hasResearchSummary(research);
        const hasUsableResearch = hasUsableCompanyResearchFields(research);
        const researchAttempted =
          research?.status === "COMPLETED" || research?.status === "PARTIAL";
        const isLinkedCompany = group.companyId.length > 0;

        return (
          <section
            key={group.companyId || "unlinked"}
            className="rounded-lg border border-edge bg-surface"
          >
            <div className="border-b border-edge px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink">
                    {group.companyName}
                  </h2>
                  {group.website ? (
                    <p className="mt-0.5 text-sm text-subtle">{group.website}</p>
                  ) : null}
                  {qualifiers.length > 0 ? (
                    <p className="mt-1 text-xs text-subtle">
                      {qualifiers.join(" · ")}
                    </p>
                  ) : null}
                </div>
                {isLinkedCompany && research ? (
                  <Link
                    href={`/companies/${group.companyId}`}
                    className={cn(SECONDARY_BUTTON_CLASS, "shrink-0", "!px-3", "!py-1.5")}
                  >
                    Company briefing
                  </Link>
                ) : null}
              </div>
            </div>

            {isLinkedCompany ? (
              <div className="border-b border-edge px-4 py-3 sm:px-5">
                {showSummary && research ? (
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    {research.whatTheySell?.trim() ? (
                      <div className="sm:col-span-2">
                        <dt className="font-medium text-ink">What they make or do</dt>
                        <dd className="mt-0.5 text-muted">
                          {research.whatTheySell.trim()}
                        </dd>
                      </div>
                    ) : null}
                    {formatCustomerAudience(research) ? (
                      <div className="sm:col-span-2">
                        <dt className="font-medium text-ink">Who they serve</dt>
                        <dd className="mt-0.5 text-muted">
                          {formatCustomerAudience(research)}
                        </dd>
                      </div>
                    ) : null}
                    {firstBuyingSignal(research) ? (
                      <div className="sm:col-span-2">
                        <dt className="font-medium text-ink">Buying signal</dt>
                        <dd className="mt-0.5 text-muted">
                          {firstBuyingSignal(research)}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted">
                      {researchAttempted && !hasUsableResearch
                        ? "Research ran, but no usable company details were found. Add context in the company briefing, retry, or continue without it."
                        : hasUsableResearch
                          ? "Research is available in the full company briefing."
                          : research?.status === "FAILED"
                            ? "Company research did not complete. Retry or add context manually."
                            : "Company research has not been run yet."}
                    </p>
                    {!listArchived && !readOnly ? (
                      <RefreshCompanyResearchForm
                        companyId={group.companyId}
                        contactListId={contactListId}
                        label="Research this company"
                      />
                    ) : null}
                  </div>
                )}
              </div>
            ) : (
              <div className="border-b border-edge px-4 py-3 sm:px-5">
                <p className="text-sm text-muted">
                  These {vocab.contact.plural} could not be linked to a company record. Add a
                  company name on import to enable research.
                </p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-canvas text-left text-subtle">
                  <tr>
                    <th className="px-4 py-2.5 font-medium sm:px-5">{vocab.contact.Singular}</th>
                    <th className="px-4 py-2.5 font-medium sm:px-5">Title</th>
                    <th className="px-4 py-2.5 font-medium sm:px-5">Suppression</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {group.contacts.map((contact) => (
                    <tr key={contact.id}>
                      <td className="px-4 py-2.5 sm:px-5">
                        <p className="font-medium text-ink">
                          {contactDisplayName(contact.firstName, contact.lastName)}
                        </p>
                        {contact.email ? (
                          <p className="mt-0.5 text-muted">
                            {contact.email}
                            {contactMatchesSuppressionSet(
                              contact.email,
                              suppressedEmails,
                            ) ? (
                              <span className="ml-2 rounded bg-warning-tint px-1.5 py-0.5 text-xs text-warning">
                                Opted out
                              </span>
                            ) : null}
                          </p>
                        ) : (
                          <span
                            className="mt-0.5 inline-block rounded bg-canvas px-1.5 py-0.5 text-xs text-ink"
                            title="No email address — cannot be emailed, scored, or suppressed."
                          >
                            No email — unusable
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted sm:px-5">
                        {contact.title ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 sm:px-5">
                        {contact.email && !listArchived && !readOnly ? (
                          <SuppressContactForm
                            contactId={contact.id}
                            email={contact.email}
                            suppressed={contactMatchesSuppressionSet(
                              contact.email,
                              suppressedEmails,
                            )}
                          />
                        ) : (
                          <span className="text-xs text-subtle">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

import Link from "next/link";
import {
  canEditTransactionalTemplates,
  canMutatePlatform,
  requirePlatformOperator,
} from "@/lib/auth/authz";
import { ensureAiModelRatesSeeded } from "@/lib/platform/model-rates";
import {
  computeCostReport,
  getLatestSpendDrift,
} from "@/lib/platform/cost";
import { listPurgeEligibleOrganizations } from "@/lib/platform/purge-contact-outbound";
import { CONTACT_OUTBOUND_RETENTION_DAYS } from "@/lib/platform/purge-contact-outbound-shared";
import { PLATFORM_ROUTE_AUDIT } from "@/lib/platform/route-audit";
import { vocab } from "@/lib/product-config";

function formatUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function formatRatio(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}×`;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function PlatformHomePage() {
  const user = await requirePlatformOperator();
  await ensureAiModelRatesSeeded();

  const [report, drift, purgeEligible] = await Promise.all([
    computeCostReport({ window: "30d" }),
    getLatestSpendDrift(),
    listPurgeEligibleOrganizations(),
  ]);

  const canEditTemplates = canEditTransactionalTemplates(user.platformRole);
  const canMutate = canMutatePlatform(user.platformRole);
  const proj300 = report.projections.find((p) => p.emails === 300);

  const areas = [
    {
      href: "/platform/orgs",
      title: "Organizations",
      body: "List tenants, create free Individual or Enterprise accounts, manage policy and members.",
    },
    {
      href: "/platform/support",
      title: "Support",
      body: "Review support requests, update status, and add internal notes.",
    },
    {
      href: "/platform/orgs/new",
      title: "Create account",
      body: "Invite a first OWNER by email. Every account starts free until Stripe.",
      superAdminOnly: true,
    },
    {
      href: "/platform/costs",
      title: "Costs & margin",
      body: `Cost per company, ${vocab.contact.plural} ratio, projections, model rates, spend reconciliation.`,
    },
    {
      href: "/platform/ai",
      title: "AI configuration",
      body: "Which AI roles are configured in the environment (operators only).",
    },
    {
      href: "/platform/email-templates",
      title: "Email templates",
      body: "Edit and test transactional email templates.",
      superAdminOnly: true,
    },
    {
      href: "/platform/billing",
      title: "Billing Config",
      body: "Trial length and Stripe price IDs for new Checkout (console override over environment).",
      superAdminOnly: true,
    },
    {
      href: "/platform/catalog",
      title: "Plan Catalog",
      body: "Plan names, feature bullets, and entitlement floors for new signups.",
      superAdminOnly: true,
    },
    {
      href: "/platform/eula",
      title: "EULA / Terms",
      body: "Publish End User License Agreement versions users must accept.",
      superAdminOnly: true,
    },
  ].filter((a) => !a.superAdminOnly || canEditTemplates);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform</h1>
        <p className="mt-1 text-sm text-slate-600">
          Ops home — cost/margin signals and org administration. Use the nav
          above on every platform page.
        </p>
      </div>

      {drift.hasDrift && drift.latest ? (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <p className="font-medium">Provider spend drift above threshold</p>
          <p className="mt-1 text-amber-900">
            Latest {drift.latest.provider} reconciliation:{" "}
            {drift.latest.driftPercent.toFixed(1)}% drift (threshold{" "}
            {drift.thresholdPercent}%). Reported $
            {drift.latest.providerReportedUsd.toFixed(2)} vs estimated $
            {drift.latest.estimatedUsd.toFixed(2)}.
          </p>
          <p className="mt-2">
            <Link
              href="/platform/costs#reconciliation"
              className="font-medium underline"
            >
              Review costs &amp; reconciliation
            </Link>
          </p>
        </div>
      ) : null}

      {purgeEligible.length > 0 ? (
        <section
          className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/80 p-4"
          data-testid="platform-purge-eligible"
        >
          <div>
            <h2 className="text-lg font-medium text-amber-950">
              {vocab.contact.Singular} data purge due ({purgeEligible.length})
            </h2>
            <p className="mt-1 text-sm text-amber-900">
              Canceled organizations past the {CONTACT_OUTBOUND_RETENTION_DAYS}
              -day retention window that still have {vocab.contact.plural}, {vocab.campaign.plural}, or
              suppressions. Open the org and run{" "}
              <span className="font-medium">
                Delete {vocab.contact.singular} and outbound data
              </span>
              {canMutate ? "" : " (SUPER_ADMIN only)"}.
            </p>
          </div>
          <ul className="divide-y divide-amber-200/80 rounded-md border border-amber-200 bg-white text-sm">
            {purgeEligible.map((org) => (
              <li
                key={org.organizationId}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
              >
                <div>
                  <Link
                    href={`/platform/orgs/${org.organizationId}`}
                    className="font-medium text-slate-900 underline"
                  >
                    {org.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    Canceled {formatDate(org.canceledAt)} · Eligible since{" "}
                    {formatDate(org.eligibleAt)} · {org.contactCount} {vocab.contact.plural} ·{" "}
                    {org.campaignCount} {vocab.campaign.plural} · {org.suppressionCount}{" "}
                    suppressions
                  </p>
                </div>
                <Link
                  href={`/platform/orgs/${org.organizationId}`}
                  className="text-xs font-medium text-amber-950 underline"
                >
                  Open org
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Admin areas</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {areas.map((area) => (
            <li
              key={area.href}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <Link
                href={area.href}
                className="text-base font-semibold text-slate-900 underline"
              >
                {area.title}
              </Link>
              <p className="mt-1 text-sm text-slate-600">{area.body}</p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500" data-testid="platform-route-audit">
          Linked routes: {PLATFORM_ROUTE_AUDIT.join(", ")}. Org detail and
          scoped view open from Organizations.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Last 30 days (platform-wide)</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Cost / company
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatUsd(report.costPerCompanyUsd)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {vocab.contact.Plural} / company
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatRatio(report.contactsPerCompany)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Projected 300-email month
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatUsd(proj300?.estimatedMonthlyUsd ?? null)}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

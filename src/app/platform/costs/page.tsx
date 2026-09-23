import { PRIMARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  canMutatePlatform,
  requirePlatformOperator,
} from "@/lib/auth/authz";
import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import {
  upsertAiModelRateAction,
  recordSpendReconciliationAction,
} from "@/app/actions/platform-costs";
import {
  ensureAiModelRatesSeeded,
  listAiModelRates,
} from "@/lib/platform/model-rates";
import {
  computeCostReport,
  listOrgCostSummaries,
  listSpendReconciliations,
  type CostWindow,
} from "@/lib/platform/cost";
import { vocab } from "@/lib/product-config";

function parseWindow(raw: string | undefined): CostWindow {
  if (raw === "7d" || raw === "30d" || raw === "90d") return raw;
  return "30d";
}

function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function formatRatio(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

export default async function PlatformCostsPage({
  searchParams,
}: {
  searchParams?: Promise<{ window?: string }>;
}) {
  const user = await requirePlatformOperator();
  const canMutate = canMutatePlatform(user.platformRole);
  const params = searchParams ? await searchParams : {};
  const window = parseWindow(params.window);

  await ensureAiModelRatesSeeded();

  const [report, orgSummaries, rates, reconciliations] = await Promise.all([
    computeCostReport({ window }),
    listOrgCostSummaries(window),
    listAiModelRates(),
    listSpendReconciliations(30),
  ]);

  const windows: CostWindow[] = ["7d", "30d", "90d"];

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/platform" className="underline">
              Platform
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Costs &amp; margin
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Estimated COGS from UsageEvents × DB model rates. No Stripe / billing
            PII.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {windows.map((w) => (
            <Link
              key={w}
              href={`/platform/costs?window=${w}`}
              className={
                w === window
                  ? "font-medium text-slate-900 underline"
                  : "text-slate-600 hover:text-slate-900"
              }
            >
              {w}
            </Link>
          ))}
        </div>
      </div>

      {/* 1. Cost per company */}
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Cost per company researched</h2>
        <p className="text-3xl font-semibold tabular-nums">
          {formatUsd(report.costPerCompanyUsd)}
        </p>
        <p className="max-w-2xl text-sm text-slate-600">
          Non-email estimated spend ÷ distinct companies with RESEARCH
          SUCCESS/PARTIAL in the window ({report.companiesResearched}{" "}
          companies). Falls back to active researched company count when the
          window has no research events. Total estimated spend:{" "}
          {formatUsd(report.estimatedSpendUsd)}.
        </p>
      </section>

      {/* 2. Contact ratio */}
      <section className="space-y-2">
        <h2 className="text-lg font-medium">{vocab.contact.Plural} per company</h2>
        <p className="text-3xl font-semibold tabular-nums">
          {formatRatio(report.contactsPerCompany)}
          {report.contactsPerCompany != null ? "×" : ""}
        </p>
        <p className="max-w-2xl text-sm text-slate-600">
          {report.contactsWithCompany} {vocab.contact.plural} across{" "}
          {report.distinctCompaniesWithContacts} companies ({vocab.contact.plural} with a
          companyId).
          {report.costMultiplierVsMultiThread != null ? (
            <>
              {" "}
              At 1:1 outreach you would need ~{formatRatio(
                report.costMultiplierVsMultiThread,
              )}
              × more company research for the same {vocab.contact.singular} volume than the
              observed multi-thread ratio.
            </>
          ) : null}
        </p>
      </section>

      {/* 3. Projections */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">
          Projected monthly cost (observed ratio)
        </h2>
        <p className="text-sm text-slate-600">
          Assumptions: one email ≈ one {vocab.contact.singular}; companiesNeeded = emails ÷
          {vocab.contact.plural}/company (1.0 if unknown); cost = companies × cost/company +
          emails × cost/email ({formatUsd(report.costPerEmailUsd)}/email from{" "}
          {report.emailDraftCount} drafts).
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Emails / month</th>
                <th className="px-3 py-2 font-medium">Companies needed</th>
                <th className="px-3 py-2 font-medium">Estimated USD</th>
              </tr>
            </thead>
            <tbody>
              {report.projections.map((p) => (
                <tr
                  key={p.emails}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-3 py-2 tabular-nums">{p.emails}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {p.companiesNeeded.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatUsd(p.estimatedMonthlyUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Spend by category */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Spend by category</h2>
        <p className="text-sm text-slate-600">
          Unrated events (no matching model rate): {report.unratedEventCount}
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Estimated USD</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(report.byCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, usd]) => (
                  <tr
                    key={cat}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-3 py-2">{cat}</td>
                    <td className="px-3 py-2 tabular-nums">{formatUsd(usd)}</td>
                  </tr>
                ))}
              {Object.keys(report.byCategory).length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 py-6 text-center text-slate-500">
                    No usage in this window.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Per-org table */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Per organization</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Organization</th>
                <th className="px-3 py-2 font-medium">Cost / company</th>
                <th className="px-3 py-2 font-medium">{vocab.contact.Plural} / company</th>
                <th className="px-3 py-2 font-medium">{window} spend</th>
              </tr>
            </thead>
            <tbody>
              {orgSummaries.map((row) => (
                <tr
                  key={row.organizationId}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/platform/orgs/${row.organizationId}`}
                      className="font-medium underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatUsd(row.costPerCompanyUsd)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatRatio(row.contactsPerCompany)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatUsd(row.estimatedSpendUsd)}
                  </td>
                </tr>
              ))}
              {orgSummaries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    No organizations.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. Model rates */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Model rates</h2>
        <p className="text-sm text-slate-600">
          Versioned by effectiveFrom. Cost math always reads the latest rate ≤
          event time from the database.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Provider</th>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 font-medium">Input / 1M</th>
                <th className="px-3 py-2 font-medium">Output / 1M</th>
                <th className="px-3 py-2 font-medium">Web search</th>
                <th className="px-3 py-2 font-medium">Effective from</th>
                <th className="px-3 py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr
                  key={r.id ?? `${r.provider}-${r.model}-${r.effectiveFrom.toISOString()}`}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-3 py-2">{r.provider}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.model}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatUsd(r.inputPer1MUsd)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatUsd(r.outputPer1MUsd)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatUsd(r.webSearchPerCallUsd)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.effectiveFrom.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{r.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canMutate ? (
          <ActionFeedbackForm
            action={upsertAiModelRateAction}
            className="grid max-w-xl gap-3 sm:grid-cols-2"
            testId="platform-model-rate-form"
          >
            <label className="block text-sm">
              Provider
              <input
                name="provider"
                required
                defaultValue="openai"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Model
              <input
                name="model"
                required
                placeholder="gpt-5 or *"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Input $/1M tokens
              <input
                name="inputPer1MUsd"
                type="number"
                step="0.000001"
                min={0}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Output $/1M tokens
              <input
                name="outputPer1MUsd"
                type="number"
                step="0.000001"
                min={0}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Web search $/call
              <input
                name="webSearchPerCallUsd"
                type="number"
                step="0.000001"
                min={0}
                required
                defaultValue="0.01"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Effective from (UTC)
              <input
                name="effectiveFrom"
                type="datetime-local"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              Note
              <input
                name="note"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className={cn(PRIMARY_BUTTON_CLASS, "sm:col-span-2", "!px-3")}
            >
              Add rate version
            </button>
          </ActionFeedbackForm>
        ) : (
          <p className="text-sm text-slate-500">
            Rate edits require SUPER_ADMIN.
          </p>
        )}
      </section>

      {/* 7. Reconciliation */}
      <section id="reconciliation" className="space-y-3">
        <h2 className="text-lg font-medium">Spend reconciliation</h2>
        <p className="text-sm text-slate-600">
          Compare provider-dashboard reported USD to our estimated UsageEvent
          spend. Drift flag when |Δ|/actual &gt; 15%.
        </p>

        {canMutate ? (
          <ActionFeedbackForm
            action={recordSpendReconciliationAction}
            className="grid max-w-xl gap-3 sm:grid-cols-2"
            testId="platform-spend-reconcile-form"
          >
            <label className="block text-sm">
              Provider
              <input
                name="provider"
                defaultValue="openai"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Provider reported USD
              <input
                name="providerReportedUsd"
                type="number"
                step="0.01"
                min={0}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Period start
              <input
                name="periodStart"
                type="datetime-local"
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Period end
              <input
                name="periodEnd"
                type="datetime-local"
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              Notes
              <input
                name="notes"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className={cn(PRIMARY_BUTTON_CLASS, "sm:col-span-2", "!px-3")}
            >
              Record reconciliation
            </button>
          </ActionFeedbackForm>
        ) : (
          <p className="text-sm text-slate-500">
            Recording reconciliations requires SUPER_ADMIN.
          </p>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Provider</th>
                <th className="px-3 py-2 font-medium">Period</th>
                <th className="px-3 py-2 font-medium">Reported</th>
                <th className="px-3 py-2 font-medium">Estimated</th>
                <th className="px-3 py-2 font-medium">Drift %</th>
              </tr>
            </thead>
            <tbody>
              {reconciliations.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-3 py-2 tabular-nums">
                    {r.createdAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-3 py-2">{r.provider}</td>
                  <td className="px-3 py-2 tabular-nums text-xs">
                    {r.periodStart.toISOString().slice(0, 10)} →{" "}
                    {r.periodEnd.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatUsd(r.providerReportedUsd)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatUsd(r.estimatedUsd)}
                  </td>
                  <td
                    className={`px-3 py-2 tabular-nums ${
                      r.hasDrift ? "font-medium text-amber-800" : ""
                    }`}
                  >
                    {r.driftPercent.toFixed(1)}%
                  </td>
                </tr>
              ))}
              {reconciliations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    No reconciliations yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

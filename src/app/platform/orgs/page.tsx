import { PRIMARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { requirePlatformOperator, canMutatePlatform } from "@/lib/auth/authz";
import { listOrganizationsForPlatform } from "@/lib/platform/orgs";
import { listPurgeEligibleOrganizations } from "@/lib/platform/purge-contact-outbound";
import {
  billingPlanLabel,
  billingStatusLabel,
} from "@/lib/billing/billing-state";
import { vocab } from "@/lib/product-config";

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

export default async function PlatformOrgsPage() {
  const user = await requirePlatformOperator();
  const [orgs, purgeEligible] = await Promise.all([
    listOrganizationsForPlatform({ actorUserId: user.id }),
    listPurgeEligibleOrganizations(),
  ]);
  const canMutate = canMutatePlatform(user.platformRole);
  const purgeByOrgId = new Map(
    purgeEligible.map((row) => [row.organizationId, row] as const),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Organizations
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {canMutate
              ? "SUPER_ADMIN — create accounts, policy, suspend, credits, members."
              : "SUPPORT — scoped read-only view. Mutations require SUPER_ADMIN."}
          </p>
        </div>
        {canMutate ? (
          <Link
            href="/platform/orgs/new"
            className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
          >
            Create account
          </Link>
        ) : null}
      </div>

      {purgeEligible.length > 0 ? (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          data-testid="platform-orgs-purge-eligible"
        >
          <p className="font-medium">
            {purgeEligible.length} organization
            {purgeEligible.length === 1 ? "" : "s"} eligible for {vocab.contact.singular} data
            purge
          </p>
          <p className="mt-1 text-amber-900">
            Highlighted below. Open the org detail page to run Delete {vocab.contact.singular} and
            outbound data. Also listed on{" "}
            <Link href="/platform" className="font-medium underline">
              Platform home
            </Link>
            .
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Members</th>
              <th className="px-3 py-2 font-medium">{vocab.product.Plural}</th>
              <th className="px-3 py-2 font-medium">{vocab.campaign.Plural}</th>
              <th className="px-3 py-2 font-medium">Companies</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium">Last active</th>
              <th className="px-3 py-2 font-medium">Purge</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => {
              const purge = purgeByOrgId.get(org.id);
              return (
                <tr
                  key={org.id}
                  className={`border-b border-slate-100 last:border-0 ${
                    purge ? "bg-amber-50/70" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/platform/orgs/${org.id}`}
                      className="font-medium text-slate-900 underline"
                    >
                      {org.name}
                    </Link>
                    <div className="text-xs text-slate-500">{org.slug}</div>
                  </td>
                  <td className="px-3 py-2">{org.accountType}</td>
                  <td className="px-3 py-2">{org.status}</td>
                  <td className="px-3 py-2">
                    {billingPlanLabel(org.planCode)}
                    <div className="text-xs text-slate-500">
                      {billingStatusLabel(org.billingStatus)}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{org.memberCount}</td>
                  <td className="px-3 py-2 tabular-nums">{org.productCount}</td>
                  <td className="px-3 py-2 tabular-nums">{org.campaignCount}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {org.researchedCompaniesUsed}
                    {org.researchedCompaniesLimit != null
                      ? ` / ${org.researchedCompaniesLimit}`
                      : ""}
                  </td>
                  <td className="px-3 py-2">{formatDate(org.createdAt)}</td>
                  <td className="px-3 py-2">{formatDate(org.lastActiveAt)}</td>
                  <td className="px-3 py-2 text-xs">
                    {purge ? (
                      <span className="font-medium text-amber-950">
                        Eligible {formatDate(purge.eligibleAt)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
            {orgs.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  No organizations yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

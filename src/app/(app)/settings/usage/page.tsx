import Link from "next/link";
import {
  canManageOrganizationPolicy,
  getMembershipForCurrentUser,
} from "@/lib/org/authz";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";
import { countActiveResearchedCompanies } from "@/lib/usage/active-companies";
import {
  aggregateUsage,
  aggregateUsageByUser,
  type UsageAggregateWindow,
} from "@/lib/usage/events";
import {
  ensureOrganizationPolicies,
  getEffectiveUsagePolicy,
} from "@/lib/usage/policy";
import {
  getDailyEmailSendUsage,
  getDailyEmailUsage,
} from "@/lib/usage/quota";
import { prisma } from "@/lib/prisma";

function parseWindow(value: string | undefined): UsageAggregateWindow {
  if (value === "7d" || value === "30d" || value === "today") return value;
  return "7d";
}

export default async function UsageSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ window?: string }>;
}) {
  const organization = await requireOrganization();
  const { user, membership } = await getMembershipForCurrentUser(
    organization.id,
  );
  await ensureOrganizationPolicies(organization.id);

  const params = searchParams ? await searchParams : {};
  const window = parseWindow(params.window);
  const isAdmin = canManageOrganizationPolicy(membership.role);

  const [policy, activeCompanies, emailUsage, sendUsage, aggregates] =
    await Promise.all([
    getEffectiveUsagePolicy({
      organizationId: organization.id,
      userId: user.id,
    }),
    countActiveResearchedCompanies(organization.id),
    getDailyEmailUsage({
      organizationId: organization.id,
      userId: user.id,
    }),
    getDailyEmailSendUsage({
      organizationId: organization.id,
      userId: user.id,
    }),
    aggregateUsage({
      organizationId: organization.id,
      timezone: organization.timezone,
      window,
    }),
    ]);

  const byUser = isAdmin
    ? await aggregateUsageByUser({
        organizationId: organization.id,
        timezone: organization.timezone,
        window,
      })
    : [];

  const users =
    byUser.length > 0
      ? await prisma.user.findMany({
          where: {
            id: {
              in: byUser
                .map((r) => r.userId)
                .filter((id): id is string => Boolean(id)),
            },
          },
        })
      : [];
  const userName = new Map(users.map((u) => [u.id, u.name ?? u.email]));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link
          href="/settings"
          className="text-sm text-muted hover:text-ink"
        >
          ← Settings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          Usage
        </h1>
        <p className="mt-1 text-sm text-muted">
          Limits and metering for {organization.name} ({organization.timezone}).
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-edge bg-surface p-4">
          <h2 className="text-sm font-medium text-ink">
            Active researched companies
          </h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {activeCompanies}{" "}
            <span className="text-base font-normal text-subtle">
              / {policy.activeResearchedCompanyLimit}
            </span>
          </p>
          <p className="mt-1 text-xs text-subtle">
            Source: {policy.sources.activeResearchedCompanyLimit}
          </p>
        </div>
        <div className="rounded-md border border-edge bg-surface p-4">
          <h2 className="text-sm font-medium text-ink">
            AI emails generated today
          </h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {emailUsage.used}{" "}
            <span className="text-base font-normal text-subtle">
              / {emailUsage.limit}
            </span>
          </p>
          <p className="mt-1 text-xs text-subtle">
            Platform generation ceiling · Day {emailUsage.periodKey} · Source:{" "}
            {policy.sources.dailyEmailGenerationLimit}
          </p>
          <p className="mt-1 text-xs text-subtle">
            Does not count toward the send advisory.
          </p>
        </div>
        <div className="rounded-md border border-edge bg-surface p-4">
          <h2 className="text-sm font-medium text-ink">
            Confirmed sends today
          </h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {sendUsage.used}
          </p>
          <p className="mt-1 text-xs text-subtle">
            Advisory at {sendUsage.warningLimit} · Day {sendUsage.periodKey}
          </p>
          <p className="mt-1 text-xs text-subtle">
            Warns for domain reputation; never blocks sending.
          </p>
        </div>
      </section>

      {isAdmin ? (
        <>
          <div className="flex gap-2 text-sm">
            {(
              [
                ["today", "Today"],
                ["7d", "Last 7 days"],
                ["30d", "Last 30 days"],
              ] as const
            ).map(([key, label]) => (
              <Link
                key={key}
                href={`/settings/usage?window=${key}`}
                className={
                  window === key
                    ? "font-medium text-ink underline"
                    : "text-muted hover:text-ink"
                }
              >
                {label}
              </Link>
            ))}
          </div>

          <section className="rounded-md border border-edge bg-surface p-4">
            <h2 className="text-sm font-medium text-ink">
              Organization aggregates
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-subtle">Research ops</dt>
                <dd className="font-medium tabular-nums">
                  {aggregates.researchOperations}
                </dd>
              </div>
              <div>
                <dt className="text-subtle">Web searches</dt>
                <dd className="font-medium tabular-nums">
                  {aggregates.webSearches}
                </dd>
              </div>
              <div>
                <dt className="text-subtle">Scoring ops</dt>
                <dd className="font-medium tabular-nums">
                  {aggregates.scoringOperations}
                </dd>
              </div>
              <div>
                <dt className="text-subtle">Email generations</dt>
                <dd className="font-medium tabular-nums">
                  {aggregates.emailGenerations}
                </dd>
              </div>
              <div>
                <dt className="text-subtle">Input tokens</dt>
                <dd className="font-medium tabular-nums">
                  {aggregates.inputTokens}
                </dd>
              </div>
              <div>
                <dt className="text-subtle">Output tokens</dt>
                <dd className="font-medium tabular-nums">
                  {aggregates.outputTokens}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-subtle">
              Dollar cost is not calculated here. Usage units are stored for
              future versioned pricing.
            </p>
          </section>

          <section className="rounded-md border border-edge bg-surface p-4">
            <h2 className="text-sm font-medium text-ink">Usage by user</h2>
            {byUser.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No usage in window.</p>
            ) : (
              <table className="mt-3 w-full text-left text-sm">
                <thead className="text-subtle">
                  <tr>
                    <th className="py-1 font-medium">User</th>
                    <th className="py-1 font-medium">Research</th>
                    <th className="py-1 font-medium">Searches</th>
                    <th className="py-1 font-medium">Scoring</th>
                    <th className="py-1 font-medium">Tokens in/out</th>
                  </tr>
                </thead>
                <tbody>
                  {byUser.map((row) => (
                    <tr key={row.userId ?? "none"} className="border-t border-edge">
                      <td className="py-1.5">
                        {row.userId
                          ? userName.get(row.userId) ?? row.userId
                          : "Unattributed"}
                      </td>
                      <td className="tabular-nums">{row.researchOperations}</td>
                      <td className="tabular-nums">{row.webSearches}</td>
                      <td className="tabular-nums">{row.scoringOperations}</td>
                      <td className="tabular-nums">
                        {row.inputTokens}/{row.outputTokens}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <p className="text-sm">
            <Link
              href="/settings/organization"
              className="font-medium text-ink underline-offset-2 hover:underline"
            >
              Manage organization policies →
            </Link>
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">
          Aggregate and per-user usage is visible to organization administrators
          only.
        </p>
      )}
    </div>
  );
}

import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  requirePlatformOperator,
  canMutatePlatform,
} from "@/lib/auth/authz";
import {
  getOrganizationPlatformDetail,
  recordPlatformOrgView,
} from "@/lib/platform/orgs";
import { computeCostReport } from "@/lib/platform/cost";
import {
  billingPlanLabel,
  billingStatusLabel,
  formatCustomerPayingAmount,
  formatDiscountSummary,
  formatStripeMoney,
  formatPriceInterval,
  isOnCurrentCatalogPrice,
} from "@/lib/billing/billing-state";
import { hasActiveDiscount } from "@/lib/billing/price-discount-mirror";
import { loadFlattenedBillingPrices } from "@/lib/billing/effective-prices";
import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import { DeleteOrganizationPanel } from "@/components/platform/DeleteOrganizationPanel";
import { ConvertOrganizationToCompedPanel } from "@/components/platform/ConvertOrganizationToCompedPanel";
import { PurgeContactOutboundPanel } from "@/components/platform/PurgeContactOutboundPanel";
import {
  grantOrganizationCreditAction,
  grantCompanyResearchCreditsAction,
  platformChangeMemberRoleAction,
  platformInviteUserAction,
  platformRemoveMemberAction,
  platformRevokeInvitationAction,
  suspendOrganizationAction,
  unsuspendOrganizationAction,
  updatePlatformUsagePolicyAction,
  updatePlatformResearchPolicyAction,
  updatePlatformOrgMaxSeatsAction,
} from "@/app/actions/platform-orgs";
import { planUsesPerUserCompanyAllowance, COMPANY_CREDIT_BLOCK } from "@/lib/billing/plans";
import { vocab } from "@/lib/product-config";

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

export default async function PlatformOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePlatformOperator();
  const { id } = await params;
  const detail = await getOrganizationPlatformDetail(id);
  if (!detail) notFound();

  await recordPlatformOrgView({
    actorUserId: user.id,
    organizationId: id,
    surface: "detail",
  });

  const cost = await computeCostReport({ organizationId: id, window: "30d" });
  const catalogPrices = await loadFlattenedBillingPrices();
  const canMutate = canMutatePlatform(user.platformRole);
  const { organization: org, usage, health, usagePolicy, researchPolicy, billing } = detail;
  const perUserCompanyCredits = planUsesPerUserCompanyAllowance(
    billing.planCode ?? "",
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-subtle">
            <Link href="/platform/orgs" className="underline">
              Organizations
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {org.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {org.accountType} · {org.status}
            {org.suspendedAt
              ? ` · suspended ${org.suspendedAt.toISOString().slice(0, 10)}`
              : ""}
            {org.suspendedReason ? ` · ${org.suspendedReason}` : ""}
          </p>
        </div>
        <Link
          href={`/platform/orgs/${id}/view`}
          className={cn(SECONDARY_BUTTON_CLASS, "!px-3")}
        >
          Scoped customer view
        </Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Billing</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li className="rounded-md border border-edge bg-surface p-3">
            Plan: {billingPlanLabel(billing.planCode)}
            <span className="mt-1 block font-mono text-xs text-subtle">
              {billing.planCode}
            </span>
          </li>
          <li className="rounded-md border border-edge bg-surface p-3">
            Status: {billingStatusLabel(billing.billingStatus)}
          </li>
          <li className="rounded-md border border-edge bg-surface p-3 sm:col-span-2">
            Seats: {billing.seatQuantity} purchased · cap {billing.maxSeats}
            {canMutate ? (
              <ActionFeedbackForm
                action={updatePlatformOrgMaxSeatsAction}
                className="mt-3 flex flex-wrap items-end gap-2"
                testId="platform-org-max-seats-form"
              >
                <input type="hidden" name="organizationId" value={id} />
                <label className="text-xs text-muted">
                  Seat cap (Enterprise override)
                  <input
                    name="maxSeats"
                    type="number"
                    min={billing.seatQuantity}
                    defaultValue={billing.maxSeats}
                    className="mt-1 block w-28 rounded-md border border-edge-strong px-2 py-1.5 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  className={cn(PRIMARY_BUTTON_CLASS, "!px-3", "!py-1.5")}
                >
                  Save cap
                </button>
              </ActionFeedbackForm>
            ) : null}
            <p className="mt-2 text-xs text-subtle">
              Changing the cap does not change the Stripe subscription — it only
              unlocks the invite gate.
            </p>
          </li>
          <li className="rounded-md border border-edge bg-surface p-3 sm:col-span-2">
            Ops {vocab.contact.singular}:{" "}
            {billing.billingEmail ?? "— (no address/tax stored)"}
          </li>
          <li className="rounded-md border border-edge bg-surface p-3">
            <span className="text-xs uppercase tracking-wide text-subtle">
              Price ID
            </span>
            <p className="mt-1 break-all font-mono text-xs text-ink">
              {billing.stripePriceId ?? "—"}
            </p>
            {(() => {
              const catalogPriceId = catalogPrices.standardMonthlyPriceId;
              const onCatalog = isOnCurrentCatalogPrice(
                billing.stripePriceId,
                catalogPriceId,
              );
              if (onCatalog == null) return null;
              return (
                <p className="mt-1 text-xs text-subtle">
                  {onCatalog
                    ? "Matches current catalog price"
                    : "Grandfathered — differs from current catalog price"}
                </p>
              );
            })()}
          </li>
          <li className="rounded-md border border-edge bg-surface p-3">
            <span className="text-xs uppercase tracking-wide text-subtle">
              Amount / interval
            </span>
            <p className="mt-1 font-medium text-ink">
              {formatCustomerPayingAmount({
                effectiveUnitAmountCents:
                  billing.stripeEffectiveUnitAmountCents,
                listUnitAmountCents: billing.stripePriceUnitAmountCents,
                currency: billing.stripePriceCurrency,
                interval: billing.stripePriceInterval,
              })}
            </p>
            {billing.stripePriceUnitAmountCents != null &&
            billing.stripeEffectiveUnitAmountCents != null &&
            billing.stripeEffectiveUnitAmountCents <
              billing.stripePriceUnitAmountCents ? (
              <p className="mt-1 text-xs text-subtle">
                {vocab.list.Singular}:{" "}
                {formatStripeMoney(
                  billing.stripePriceUnitAmountCents,
                  billing.stripePriceCurrency,
                )}{" "}
                / {formatPriceInterval(billing.stripePriceInterval)}
              </p>
            ) : null}
          </li>
          <li className="rounded-md border border-edge bg-surface p-3 sm:col-span-2">
            <span className="text-xs uppercase tracking-wide text-subtle">
              Discount
            </span>
            <p className="mt-1 font-medium text-ink">
              {hasActiveDiscount({
                stripeDiscountPercentOff: billing.stripeDiscountPercentOff,
                stripeDiscountAmountOffCents:
                  billing.stripeDiscountAmountOffCents,
                stripeEffectiveUnitAmountCents:
                  billing.stripeEffectiveUnitAmountCents,
                stripePriceUnitAmountCents: billing.stripePriceUnitAmountCents,
              })
                ? formatDiscountSummary({
                    percentOff: billing.stripeDiscountPercentOff,
                    amountOffCents: billing.stripeDiscountAmountOffCents,
                    currency: billing.stripePriceCurrency,
                    couponId: billing.stripeCouponId,
                  })
                : "None"}
            </p>
          </li>
          <li className="rounded-md border border-edge bg-surface p-3 text-xs text-subtle sm:col-span-2">
            Stripe customer: {billing.stripeCustomerId ?? "—"} · subscription:{" "}
            {billing.stripeSubscriptionId ?? "—"}
            {billing.currentPeriodEnd
              ? ` · period ends ${billing.currentPeriodEnd.toISOString().slice(0, 10)}`
              : ""}
            {billing.trialEndsAt
              ? ` · trial ends ${billing.trialEndsAt.toISOString().slice(0, 10)}`
              : ""}
            {billing.cancelAtPeriodEnd ? " · cancels at period end" : ""}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Cost (30d)</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          <li className="rounded-md border border-edge bg-surface p-3">
            Estimated spend: {formatUsd(cost.estimatedSpendUsd)}
          </li>
          <li className="rounded-md border border-edge bg-surface p-3">
            Cost / company: {formatUsd(cost.costPerCompanyUsd)}
          </li>
          <li className="rounded-md border border-edge bg-surface p-3">
            <Link href="/platform/costs" className="font-medium underline">
              Full costs report
            </Link>
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Usage</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li className="rounded-md border border-edge bg-surface p-3">
            Researched companies: {usage.researchedCompaniesUsed}
            {usage.researchedCompaniesLimit != null
              ? ` / ${usage.researchedCompaniesLimit}`
              : ""}
          </li>
          <li className="rounded-md border border-edge bg-surface p-3">
            Email gens (today): {usage.today.emailGenerations}
          </li>
          <li className="rounded-md border border-edge bg-surface p-3">
            Research ops (7d): {usage.last7d.researchOperations}
          </li>
          <li className="rounded-md border border-edge bg-surface p-3">
            Email gens (30d): {usage.last30d.emailGenerations}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Health (failure rates)</h2>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md border border-edge bg-surface p-3">
            <p className="font-medium">Last 7 days</p>
            <p>
              Research: {pct(health.last7d.research.failureRate)} (
              {health.last7d.research.failed}/{health.last7d.research.total})
            </p>
            <p>
              Email generation:{" "}
              {pct(health.last7d.emailGeneration.failureRate)} (
              {health.last7d.emailGeneration.failed}/
              {health.last7d.emailGeneration.total})
            </p>
          </div>
          <div className="rounded-md border border-edge bg-surface p-3">
            <p className="font-medium">Last 30 days</p>
            <p>
              Research: {pct(health.last30d.research.failureRate)} (
              {health.last30d.research.failed}/{health.last30d.research.total})
            </p>
            <p>
              Email generation:{" "}
              {pct(health.last30d.emailGeneration.failureRate)} (
              {health.last30d.emailGeneration.failed}/
              {health.last30d.emailGeneration.total})
            </p>
            <p>
              Research confidence: High{" "}
              {detail.researchConfidence30d.HIGH ?? 0} · Medium{" "}
              {detail.researchConfidence30d.MEDIUM ?? 0} · Low{" "}
              {detail.researchConfidence30d.LOW ?? 0} · Unknown{" "}
              {detail.researchConfidence30d.UNKNOWN ?? 0}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Setup completeness</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-4">
          {(
            [
              [vocab.product.Singular, detail.products.length > 0],
              [vocab.icp.singular, detail.icps.length > 0],
              [vocab.persona.Singular, detail.personas.length > 0],
              ["List", detail.contactLists.length > 0],
            ] as const
          ).map(([label, ok]) => (
            <li
              key={label}
              className="rounded-md border border-edge bg-surface px-3 py-2"
            >
              {label}: {ok ? "present" : "missing"}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Members</h2>
        <ul className="divide-y divide-slate-100 rounded-md border border-edge bg-surface text-sm">
          {detail.members.map((m) => (
            <li
              key={m.membershipId}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <span>
                {m.user.email} · {m.role}
                {m.isBillingContact ? ` · billing ${vocab.contact.singular}` : ""}
              </span>
              {canMutate && m.role !== "OWNER" ? (
                <div className="flex flex-wrap gap-2">
                  <ActionFeedbackForm
                    action={platformChangeMemberRoleAction}
                    className="flex items-center gap-1"
                  >
                    <input type="hidden" name="organizationId" value={id} />
                    <input
                      type="hidden"
                      name="targetUserId"
                      value={m.user.id}
                    />
                    <select
                      name="role"
                      defaultValue={m.role}
                      className="rounded-md border border-edge-strong px-2 py-1 text-xs"
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="MEMBER">MEMBER</option>
                    </select>
                    <button
                      type="submit"
                      className="rounded-md border border-edge-strong px-2 py-1 text-xs"
                    >
                      Save role
                    </button>
                  </ActionFeedbackForm>
                  <ActionFeedbackForm action={platformRemoveMemberAction}>
                    <input type="hidden" name="organizationId" value={id} />
                    <input
                      type="hidden"
                      name="targetUserId"
                      value={m.user.id}
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-danger px-2 py-1 text-xs text-danger"
                    >
                      Remove
                    </button>
                  </ActionFeedbackForm>
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        {canMutate ? (
          <ActionFeedbackForm
            action={platformInviteUserAction}
            className="grid gap-2 sm:grid-cols-3"
            testId="platform-invite-user-form"
          >
            <input type="hidden" name="organizationId" value={id} />
            <input
              name="email"
              type="email"
              required
              placeholder="user@company.com"
              className="rounded-md border border-edge-strong px-3 py-2 text-sm"
            />
            <select
              name="role"
              defaultValue="MEMBER"
              className="rounded-md border border-edge-strong px-3 py-2 text-sm"
            >
              <option value="MEMBER">MEMBER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <button
              type="submit"
              className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
            >
              Invite user
            </button>
          </ActionFeedbackForm>
        ) : null}

        {detail.pendingInvitations.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-ink">
              Pending invitations
            </h3>
            <ul className="divide-y divide-slate-100 rounded-md border border-edge bg-surface text-sm">
              {detail.pendingInvitations.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span>
                    {inv.email} · {inv.role} · expires{" "}
                    {inv.expiresAt.toISOString().slice(0, 10)}
                  </span>
                  {canMutate ? (
                    <ActionFeedbackForm action={platformRevokeInvitationAction}>
                      <input type="hidden" name="organizationId" value={id} />
                      <input type="hidden" name="invitationId" value={inv.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-edge-strong px-2 py-1 text-xs"
                      >
                        Revoke
                      </button>
                    </ActionFeedbackForm>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="text-lg font-medium">
            {vocab.product.Plural} ({detail.products.length})
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {detail.products.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
            {detail.products.length === 0 ? (
              <li className="text-subtle">None</li>
            ) : null}
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-medium">
            {vocab.campaign.Plural} ({detail.campaigns.length})
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {detail.campaigns.map((c) => (
              <li key={c.id}>
                {c.name} · {c.status}
              </li>
            ))}
            {detail.campaigns.length === 0 ? (
              <li className="text-subtle">None</li>
            ) : null}
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-medium">{vocab.icp.plural} ({detail.icps.length})</h2>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {detail.icps.map((i) => (
              <li key={i.id}>{i.name}</li>
            ))}
            {detail.icps.length === 0 ? (
              <li className="text-subtle">None</li>
            ) : null}
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-medium">
            {vocab.persona.Plural} ({detail.personas.length})
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {detail.personas.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
            {detail.personas.length === 0 ? (
              <li className="text-subtle">None</li>
            ) : null}
          </ul>
        </div>
        <div className="sm:col-span-2">
          <h2 className="text-lg font-medium">
            {vocab.list.Plural} ({detail.contactLists.length})
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {detail.contactLists.map((list) => (
              <li key={list.id}>
                {list.name}
                {list.totalContacts != null
                  ? ` · ${list.totalContacts} ${vocab.contact.plural}`
                  : ""}
              </li>
            ))}
            {detail.contactLists.length === 0 ? (
              <li className="text-subtle">None</li>
            ) : null}
          </ul>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Credit grants</h2>
        <ul className="divide-y divide-slate-100 rounded-md border border-edge bg-surface text-sm">
          {detail.creditGrants.length === 0 ? (
            <li className="px-3 py-2 text-subtle">None yet.</li>
          ) : (
            detail.creditGrants.map((g) => (
              <li key={g.id} className="px-3 py-2">
                ${String(g.amountUsd)} · {g.reason} · by {g.grantedBy.email} ·{" "}
                {g.createdAt.toISOString().slice(0, 10)}
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Company research credit packs</h2>
        <ul className="divide-y divide-slate-100 rounded-md border border-edge bg-surface text-sm">
          {detail.companyResearchCredits.length === 0 ? (
            <li className="px-3 py-2 text-subtle">None yet.</li>
          ) : (
            detail.companyResearchCredits.map((pack) => (
              <li key={pack.id} className="px-3 py-2">
                {pack.quantity} companies
                {pack.user
                  ? ` · ${pack.user.email}`
                  : " · organization pool"}
                {" · "}
                granted {pack.grantedAt.toISOString().slice(0, 10)}
                {" · expires "}
                {pack.expiresAt.toISOString().slice(0, 10)}
                {pack.stripeCheckoutSessionId ? " · Stripe" : " · platform"}
              </li>
            ))
          )}
        </ul>
      </section>

      {canMutate ? (
        <section className="space-y-6 border-t border-edge pt-6">
          <h2 className="text-lg font-medium">SUPER_ADMIN actions</h2>

          <ActionFeedbackForm
            action={updatePlatformUsagePolicyAction}
            className="grid max-w-md gap-3"
            testId="platform-usage-policy-form"
          >
            <input type="hidden" name="organizationId" value={id} />
            <label className="block text-sm">
              Active researched company limit
              <input
                name="activeResearchedCompanyLimit"
                type="number"
                min={0}
                defaultValue={
                  usagePolicy?.activeResearchedCompanyLimit ?? 50
                }
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Daily AI email generation limit
              <input
                name="dailyEmailGenerationLimit"
                type="number"
                min={0}
                defaultValue={usagePolicy?.dailyEmailGenerationLimit ?? 500}
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Daily send advisory threshold
              <input
                name="dailyEmailSendWarningLimit"
                type="number"
                min={0}
                defaultValue={usagePolicy?.dailyEmailSendWarningLimit ?? 150}
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
            >
              Save usage policy
            </button>
          </ActionFeedbackForm>

          <ActionFeedbackForm
            action={updatePlatformResearchPolicyAction}
            className="max-w-md space-y-3"
            testId="platform-research-policy-form"
          >
            <input type="hidden" name="organizationId" value={id} />
            <h3 className="text-sm font-medium text-ink">
              {vocab.contact.Singular} research
            </h3>
            <p className="text-sm text-muted">
              Per-{vocab.contact.singular} AI research during email generation. Carries real
              per-{vocab.contact.singular} cost — platform operator only. Customers cannot enable
              this in organization settings.
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="contactResearchEnabled"
                defaultChecked={researchPolicy?.contactResearchEnabled ?? false}
                className="mt-1"
              />
              <span>
                Enable {vocab.contact.singular} research for this organization
              </span>
            </label>
            <button
              type="submit"
              className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
            >
              Save research policy
            </button>
          </ActionFeedbackForm>

          {org.status === "SUSPENDED" ? (
            <ActionFeedbackForm
              action={unsuspendOrganizationAction}
              className="flex items-center gap-3"
              testId="platform-unsuspend-form"
            >
              <input type="hidden" name="organizationId" value={id} />
              <button
                type="submit"
                className="rounded-md bg-success px-3 py-2 text-sm font-medium text-on-ink"
              >
                Unsuspend organization
              </button>
            </ActionFeedbackForm>
          ) : (
            <ActionFeedbackForm
              action={suspendOrganizationAction}
              className="grid max-w-md gap-3"
              testId="platform-suspend-form"
            >
              <input type="hidden" name="organizationId" value={id} />
              <label className="block text-sm">
                Suspension reason
                <input
                  name="reason"
                  required
                  className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-danger px-3 py-2 text-sm font-medium text-on-ink"
              >
                Suspend organization
              </button>
            </ActionFeedbackForm>
          )}

          <ActionFeedbackForm
            action={grantOrganizationCreditAction}
            className="grid max-w-md gap-3"
            testId="platform-credit-form"
          >
            <input type="hidden" name="organizationId" value={id} />
            <label className="block text-sm">
              Amount (USD)
              <input
                name="amountUsd"
                type="number"
                min={0.01}
                step="0.01"
                required
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Reason
              <input
                name="reason"
                required
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Note (optional)
              <input
                name="note"
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
            >
              Grant credit
            </button>
          </ActionFeedbackForm>

          <ActionFeedbackForm
            action={grantCompanyResearchCreditsAction}
            className="grid max-w-md gap-3"
            testId="platform-company-research-credits-form"
          >
            <input type="hidden" name="organizationId" value={id} />
            <p className="text-sm text-muted">
              Company research packs: {COMPANY_CREDIT_BLOCK.units} companies
              per block (same Stripe price as Standard).{" "}
              {perUserCompanyCredits
                ? "Team/Enterprise packs apply to the selected user's personal allowance."
                : "Standard packs add to the organization pool."}
            </p>
            {perUserCompanyCredits ? (
              <label className="block text-sm">
                User
                <select
                  name="userId"
                  required
                  className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select member…
                  </option>
                  {detail.members.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.email}
                      {m.user.name ? ` (${m.user.name})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block text-sm">
              Blocks ({COMPANY_CREDIT_BLOCK.units} companies each)
              <input
                name="blocks"
                type="number"
                min={1}
                step={1}
                defaultValue={1}
                required
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Reason
              <input
                name="reason"
                required
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
            >
              Grant company research credits
            </button>
          </ActionFeedbackForm>

          <PurgeContactOutboundPanel
            organizationId={id}
            organizationName={org.name}
          />

          {billing.billingStatus !== "FREE" ||
          billing.stripeSubscriptionId ? (
            <ConvertOrganizationToCompedPanel
              organizationId={id}
              organizationName={org.name}
              defaultCompanyLimit={
                usagePolicy?.activeResearchedCompanyLimit ?? 50
              }
              defaultDailySendWarning={
                usagePolicy?.dailyEmailSendWarningLimit ?? 50
              }
              defaultMonthlyEmailLimit={
                usagePolicy?.monthlyEmailSendLimit ?? null
              }
            />
          ) : null}

          <DeleteOrganizationPanel
            organizationId={id}
            organizationName={org.name}
          />
        </section>
      ) : (
        <p className="text-sm text-subtle">
          Read-only SUPPORT view — mutations require SUPER_ADMIN.
        </p>
      )}
    </div>
  );
}

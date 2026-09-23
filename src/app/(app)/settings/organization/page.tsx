import { PRIMARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  updateOrganizationTimezoneAction,
  renameWorkspaceAction,
  inviteUserAction,
  revokeInvitationAction,
  changeMemberRoleAction,
  removeMemberAction,
} from "@/app/actions/settings";
import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import { requireOrgAdmin } from "@/lib/org/authz";
import {
  orgAdminInvitesAllowed,
  individualOrgAdminInviteBlockMessage,
} from "@/lib/org/seats";
import { buildSeatSnapshot, formatSeatsUsedLabel } from "@/lib/org/seat-limits";
import {
  planUsesInvoicedBilling,
  planUsesSeatBilling,
} from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";
import { ensureOrganizationPolicies } from "@/lib/usage/policy";
import { brand, features, vocab } from "@/lib/product-config";

function formatLimit(value: number | null | undefined): string {
  if (value == null) return "Inherit organization default";
  return String(value);
}

export default async function OrganizationSettingsPage() {
  const { organization, user } = await requireOrgAdmin();
  await ensureOrganizationPolicies(organization.id);

  const [usagePolicy, members, overrides, invitations, billing] =
    await Promise.all([
      prisma.organizationUsagePolicy.findUniqueOrThrow({
        where: { organizationId: organization.id },
      }),
      prisma.organizationMembership.findMany({
        where: { organizationId: organization.id },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.userUsageOverride.findMany({
        where: { organizationId: organization.id },
      }),
      prisma.organizationInvitation.findMany({
        where: { organizationId: organization.id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.organizationBillingProfile.findUnique({
        where: { organizationId: organization.id },
        select: {
          planCode: true,
          seatQuantity: true,
          maxSeats: true,
          billingStatus: true,
        },
      }),
    ]);

  const seatSnap = buildSeatSnapshot({
    planCode: billing?.planCode ?? "STANDARD",
    seatQuantity: billing?.seatQuantity ?? 1,
    maxSeats: billing?.maxSeats ?? 1,
    usedSeats: members.length,
  });

  const canInvite = orgAdminInvitesAllowed({
    accountType: organization.accountType,
    planCode: billing?.planCode ?? null,
    seatQuantity: seatSnap.seatQuantity,
    maxSeats: seatSnap.maxSeats,
    usedSeats: seatSnap.usedSeats,
  });

  const showSeats = planUsesSeatBilling(billing?.planCode ?? "");
  const seatsAreInvoiceManaged = planUsesInvoicedBilling(
    billing?.planCode ?? "",
  );

  const overrideByUser = new Map(
    overrides.map((o) => [o.userId, o] as const),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <Link
          href="/settings"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Settings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Organization
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Admin settings for {organization.name}. Signed in as {user.email}.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-slate-900">Workspace name</h2>
        <ActionFeedbackForm
          action={renameWorkspaceAction}
          className="flex gap-2"
          testId="rename-workspace-form"
        >
          <input
            name="name"
            defaultValue={organization.name}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
          >
            Save
          </button>
        </ActionFeedbackForm>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-slate-900">Timezone</h2>
        <p className="text-sm text-slate-600">
          Daily email quotas and the send advisory use this IANA timezone (not
          server UTC alone).
        </p>
        <ActionFeedbackForm
          action={updateOrganizationTimezoneAction}
          className="flex gap-2"
          testId="timezone-form"
        >
          <input
            name="timezone"
            defaultValue={organization.timezone}
            placeholder="America/New_York"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
          >
            Save
          </button>
        </ActionFeedbackForm>
        <p className="text-sm">
          <Link href="/settings/cadence" className="font-medium underline">
            Email cadence settings
          </Link>{" "}
          — follow-up intervals and max {vocab.sequence.singular} length.
        </p>
      </section>

      <section className="space-y-3" data-testid="usage-policy-readonly">
        <h2 className="text-lg font-medium text-slate-900">Usage limits</h2>
        <p className="text-sm text-slate-600">
          Set by your account administrator. Confirmed sends are advisory only —
          they leave from the {vocab.rep.singular}&apos;s mailbox and protect domain reputation,
          not platform cost. AI email generation is a separate platform ceiling
          and does not count toward the send advisory.
        </p>
        <dl className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Active researched companies
            </dt>
            <dd className="mt-1 text-sm text-slate-900">
              {usagePolicy.activeResearchedCompanyLimit}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Daily AI email generations
            </dt>
            <dd className="mt-1 text-sm text-slate-900">
              {usagePolicy.dailyEmailGenerationLimit}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Daily send advisory threshold
            </dt>
            <dd className="mt-1 text-sm text-slate-900">
              {usagePolicy.dailyEmailSendWarningLimit}
            </dd>
            <p className="mt-1 text-xs text-slate-500">
              Warn after this many confirmed sends today. Never blocks sending.
            </p>
          </div>
        </dl>
      </section>

      {features.teamMemberManagement ? (
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-slate-900">Members</h2>
        <p className="text-sm text-slate-600">
          OWNER and ADMIN can change roles and remove users
          {canInvite ? ", and invite new members" : ""}. {vocab.product.Singular}, {vocab.icp.singular}, and
          {vocab.persona.Plural} are shared across the org; voice and signature stay per user.
        </p>
        <ul className="space-y-3">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <span>
                {m.user.name ?? m.user.email}{" "}
                <span className="text-slate-500">
                  ({m.user.email}
                  {features.teamRoles ? ` · ${m.role}` : ""})
                </span>
              </span>
              {m.role !== "OWNER" && m.userId !== user.id ? (
                <div className="flex flex-wrap gap-2">
                  {features.teamRoles ? (
                  <ActionFeedbackForm
                    action={changeMemberRoleAction}
                    className="flex items-center gap-1"
                  >
                    <input type="hidden" name="targetUserId" value={m.userId} />
                    <select
                      name="role"
                      defaultValue={m.role}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="MEMBER">MEMBER</option>
                    </select>
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    >
                      Save role
                    </button>
                  </ActionFeedbackForm>
                  ) : null}
                  <ActionFeedbackForm action={removeMemberAction}>
                    <input type="hidden" name="targetUserId" value={m.userId} />
                    <button
                      type="submit"
                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-800"
                    >
                      Remove
                    </button>
                  </ActionFeedbackForm>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      ) : null}

      <section className="space-y-3" data-testid="user-overrides-readonly">
        <h2 className="text-lg font-medium text-slate-900">User overrides</h2>
        <p className="text-sm text-slate-600">
          Per-user ceilings set by your account administrator. Blank means the
          member inherits organization defaults.
        </p>
        <ul className="space-y-4">
          {members.map((m) => {
            const ov = overrideByUser.get(m.userId);
            return (
              <li
                key={m.id}
                className="rounded-md border border-slate-200 bg-white p-4"
                data-testid={`user-override-readonly-${m.userId}`}
              >
                <p className="text-sm font-medium text-slate-900">
                  {m.user.name ?? m.user.email}{" "}
                  <span className="font-normal text-slate-500">
                    ({m.role})
                  </span>
                </p>
                <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-slate-600">Active companies</dt>
                    <dd className="mt-1 text-sm text-slate-900">
                      {formatLimit(ov?.activeResearchedCompanyLimit)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-600">
                      Daily AI generations
                    </dt>
                    <dd className="mt-1 text-sm text-slate-900">
                      {formatLimit(ov?.dailyEmailGenerationLimit)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-600">Send advisory</dt>
                    <dd className="mt-1 text-sm text-slate-900">
                      {formatLimit(ov?.dailyEmailSendWarningLimit)}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      </section>

      {features.teamSeats && showSeats ? (
        <section className="space-y-3" data-testid="org-seats-section">
          <h2 className="text-lg font-medium text-slate-900">Seats</h2>
          <p className="text-sm text-slate-600">
            {formatSeatsUsedLabel({
              usedSeats: seatSnap.usedSeats,
              seatQuantity: seatSnap.seatQuantity,
            })}
            {" · "}
            Cap {seatSnap.maxSeats}
            {seatsAreInvoiceManaged
              ? ` (set by ${brand.appName})`
              : ""}
            .
          </p>
          <p className="text-sm text-slate-600">
            {seatsAreInvoiceManaged ? (
              "Contact support to change invoice-managed seats."
            ) : (
              <>
                Add or remove seats from{" "}
                <Link
                  href="/settings/billing"
                  className="font-medium text-slate-900 underline"
                >
                  Billing
                </Link>
                . Seat changes update your subscription and require confirmation.
              </>
            )}
          </p>
        </section>
      ) : null}

      {features.teamInvites ? (
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-slate-900">Invite user</h2>
        {canInvite ? (
          <>
            <ActionFeedbackForm
              action={inviteUserAction}
              className="grid gap-2 sm:grid-cols-3"
              testId="invite-user-form"
            >
              <input
                name="email"
                type="email"
                required
                placeholder="colleague@company.com"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
              />
              <select
                name="role"
                defaultValue="MEMBER"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="MEMBER">MEMBER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <button
                type="submit"
                className={cn(PRIMARY_BUTTON_CLASS, "sm:col-span-3", "w-fit", "!px-3")}
              >
                Create invitation
              </button>
            </ActionFeedbackForm>
            {invitations.length > 0 ? (
              <ul className="space-y-2 text-sm text-slate-600">
                {invitations.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
                  >
                    <span>
                      Pending: {inv.email} as {inv.role} (expires{" "}
                      {inv.expiresAt.toISOString().slice(0, 10)})
                    </span>
                    <ActionFeedbackForm action={revokeInvitationAction}>
                      <input type="hidden" name="invitationId" value={inv.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      >
                        Revoke
                      </button>
                    </ActionFeedbackForm>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-xs text-slate-500">
              Invitation tokens are hashed at rest. Accept via the emailed link.
            </p>
          </>
        ) : (
          <p
            className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"
            data-testid="invite-blocked-individual"
          >
            {seatSnap.inviteDenialReason ??
              individualOrgAdminInviteBlockMessage()}
          </p>
        )}
      </section>
      ) : null}
    </div>
  );
}

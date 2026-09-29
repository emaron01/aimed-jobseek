import Link from "next/link";
import {
  readDismissedPersonalBillingOrgIds,
} from "@/app/actions/workspace";
import { PersonalBillingNoticeBanner } from "@/components/billing/PersonalBillingNoticeBanner";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { getCurrentUser, resolveActiveOrganization } from "@/lib/auth/session";
import { isPlatformOperator } from "@/lib/auth/authz";
import {
  buildSidebarNavItems,
  buildUserMenuModel,
  type MembershipRoleForMenu,
} from "@/lib/auth/user-menu";
import {
  accountCancelScheduledMessage,
  ACCOUNT_READ_ONLY_BANNER_MESSAGE,
} from "@/lib/billing/account-read-only";
import { billingPlanLabel } from "@/lib/billing/billing-state";
import { planAllowsReferrals } from "@/lib/billing/plans";
import { features } from "@/lib/product-config";
import {
  listOwnedBilledOrganizationsAsideFrom,
  listWorkspacesForUser,
} from "@/lib/org/workspaces";
import { prisma } from "@/lib/prisma";

export async function AppShell({
  children,
  paymentLocked = false,
  accountReadOnly = false,
  cancelAtPeriodEnd = false,
  currentPeriodEnd = null,
}: {
  children: React.ReactNode;
  /** @deprecated B3 removes billing-only shell; always false. */
  paymentLocked?: boolean;
  /** Post-period read-only window (B3). */
  accountReadOnly?: boolean;
  /** Cancel scheduled; full access until period end. */
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: Date | null;
}) {
  const user = await getCurrentUser();
  const organization = user ? await getCurrentOrganization() : null;
  const membershipCtx =
    user && organization ? await resolveActiveOrganization(user) : null;

  const billingPlanCode = organization
    ? (
        await prisma.organizationBillingProfile.findUnique({
          where: { organizationId: organization.id },
          select: { planCode: true },
        })
      )?.planCode
    : null;

  const workspaces = user
    ? await listWorkspacesForUser({
        userId: user.id,
        activeOrganizationId: user.activeOrganizationId,
      })
    : [];

  const menuModel = user
    ? buildUserMenuModel({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        platformRole: user.platformRole,
        organizationName: organization?.name ?? null,
        membershipRole:
          (membershipCtx?.membership.role as
            | MembershipRoleForMenu
            | undefined) ?? null,
        paymentLocked: false,
        workspaces: workspaces.map((w) => ({
          organizationId: w.organizationId,
          name: w.name,
          isActive: w.isActive,
        })),
      })
    : null;

  const sidebarItems = buildSidebarNavItems({
    hasOrganization: Boolean(organization),
    isPlatformOperator: user ? isPlatformOperator(user.platformRole) : false,
    paymentLocked: false,
  });

  let personalBillingNoticeOrgs: Array<{
    organizationId: string;
    name: string;
    planLabel: string;
  }> = [];
  if (user && organization) {
    const owned = await listOwnedBilledOrganizationsAsideFrom({
      userId: user.id,
      excludeOrganizationId: organization.id,
    });
    if (owned.length > 0) {
      const dismissed = await readDismissedPersonalBillingOrgIds();
      personalBillingNoticeOrgs = owned
        .filter((o) => !dismissed.has(o.organizationId))
        .map((o) => ({
          organizationId: o.organizationId,
          name: o.name,
          planLabel: billingPlanLabel(o.planCode),
        }));
    }
  }

  void paymentLocked;

  return (
    <div className="flex min-h-screen bg-surface text-ink">
      <Sidebar items={sidebarItems} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          menuModel={menuModel}
          showReferrals={
            features.referralProgram && planAllowsReferrals(billingPlanCode)
          }
        />
        {accountReadOnly ? (
          <div
            role="status"
            className="border-b border-warning bg-warning-tint px-4 py-2.5 text-sm text-warning"
            data-testid="account-readonly-banner"
          >
            <p>
              {ACCOUNT_READ_ONLY_BANNER_MESSAGE}{" "}
              <Link
                href="/settings/billing"
                className="font-medium underline underline-offset-2"
              >
                Renew subscription
              </Link>
            </p>
          </div>
        ) : cancelAtPeriodEnd && currentPeriodEnd ? (
          <div
            role="status"
            className="border-b border-border bg-panel px-4 py-2.5 text-sm text-ink"
            data-testid="cancel-at-period-end-banner"
          >
            <p>{accountCancelScheduledMessage(currentPeriodEnd)}</p>
          </div>
        ) : null}
        {personalBillingNoticeOrgs.length > 0 ? (
          <PersonalBillingNoticeBanner orgs={personalBillingNoticeOrgs} />
        ) : null}
        <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

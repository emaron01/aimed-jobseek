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
  pastDueReadOnly = false,
}: {
  children: React.ReactNode;
  paymentLocked?: boolean;
  /** PAST_DUE grace: views allowed, all writes blocked. */
  pastDueReadOnly?: boolean;
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
        paymentLocked,
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
    paymentLocked,
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
        {pastDueReadOnly && !paymentLocked ? (
          <div
            role="status"
            className="border-b border-warning bg-warning-tint px-4 py-2.5 text-sm text-warning"
            data-testid="past-due-readonly-banner"
          >
            <p>
              Payment is past due — your workspace is read-only. You can view
              everything, but you cannot change setup data or use research,
              email generation, or sending.{" "}
              <Link
                href="/settings/billing"
                className="font-medium underline underline-offset-2"
              >
                Update billing
              </Link>{" "}
              to restore access.
            </p>
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

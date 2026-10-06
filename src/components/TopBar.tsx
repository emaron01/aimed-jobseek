import { ReferAFriendButton } from "@/components/billing/ReferAFriendButton";
import { UserMenu } from "@/components/UserMenu";
import type { UserMenuModel } from "@/lib/auth/user-menu";

export function TopBar({
  menuModel,
  showReferrals = false,
  workspaceTitle = null,
  progressLine = null,
}: {
  menuModel: UserMenuModel | null;
  /** Paid or comped Standard — Team / Enterprise hide Refer a Friend. */
  showReferrals?: boolean;
  /** Set on application pages. Other pages keep Workspace, Platform, or Account. */
  workspaceTitle?: string | null;
  progressLine?: string | null;
}) {
  const fallback = menuModel?.organizationName
    ? "Workspace"
    : menuModel?.platformRoleLabel
      ? "Platform"
      : "Account";
  return (
    <header className="flex min-h-14 items-center justify-between border-b border-edge bg-surface px-6 print:hidden">
      <div className="py-2 text-sm text-muted">
        <div data-testid="workspace-heading">{workspaceTitle ?? fallback}</div>
        {progressLine ? (
          <div data-testid="application-progress-line">{progressLine}</div>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        {menuModel ? (
          <>
            {showReferrals ? <ReferAFriendButton /> : null}
            <UserMenu model={menuModel} />
          </>
        ) : (
          <p className="text-sm text-muted">Sign in required</p>
        )}
      </div>
    </header>
  );
}

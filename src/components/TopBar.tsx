import { ReferAFriendButton } from "@/components/billing/ReferAFriendButton";
import { StatusPill } from "@/components/design";
import { UserMenu } from "@/components/UserMenu";
import type { UserMenuModel } from "@/lib/auth/user-menu";

export function TopBar({
  menuModel,
  showReferrals = false,
  workspaceTitle = null,
  progress = null,
}: {
  menuModel: UserMenuModel | null;
  /** Paid or comped Standard — Team / Enterprise hide Refer a Friend. */
  showReferrals?: boolean;
  /** Set on application pages. Other pages keep Workspace, Platform, or Account. */
  workspaceTitle?: string | null;
  progress?: { current: string; next: string | null } | null;
}) {
  const fallback = menuModel?.organizationName
    ? "Workspace"
    : menuModel?.platformRoleLabel
      ? "Platform"
      : "Account";
  return (
    <header className="flex min-h-14 items-center justify-between border-b border-edge bg-surface px-6 print:hidden">
      <div className="flex min-w-0 items-center gap-3 py-2 text-sm text-muted">
        <div className="shrink-0" data-testid="workspace-heading">
          {workspaceTitle ?? fallback}
        </div>
        {progress ? (
          <div
            className="flex min-w-0 items-center gap-2"
            data-testid="application-progress-line"
          >
            <StatusPill tone="done">{progress.current}</StatusPill>
            {progress.next ? (
              <StatusPill tone="attention">{progress.next}</StatusPill>
            ) : null}
          </div>
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

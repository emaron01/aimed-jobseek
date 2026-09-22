import { ReferAFriendButton } from "@/components/billing/ReferAFriendButton";
import { UserMenu } from "@/components/UserMenu";
import type { UserMenuModel } from "@/lib/auth/user-menu";

export function TopBar({
  menuModel,
  showReferrals = false,
}: {
  menuModel: UserMenuModel | null;
  /** Paid or comped Standard — Team / Enterprise hide Refer a Friend. */
  showReferrals?: boolean;
}) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6 print:hidden">
      <div className="text-sm text-slate-500">
        {menuModel?.organizationName
          ? "Workspace"
          : menuModel?.platformRoleLabel
            ? "Platform"
            : "Account"}
      </div>
      <div className="flex items-center gap-3">
        {menuModel ? (
          <>
            {showReferrals ? <ReferAFriendButton /> : null}
            <UserMenu model={menuModel} />
          </>
        ) : (
          <p className="text-sm text-slate-500">Sign in required</p>
        )}
      </div>
    </header>
  );
}

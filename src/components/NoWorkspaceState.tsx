import { EmptyState } from "@/components/ui";
import Link from "next/link";
import { isDevTenantBypassEnabled } from "@/lib/auth/config";

/**
 * Server-side workspace-missing state (preferred over TenantMissing when
 * async auth context is available).
 */
export async function NoWorkspaceState() {
  if (isDevTenantBypassEnabled()) {
    return (
      <EmptyState
        title="Organization not configured"
        description="Set DEV_ORGANIZATION_ID in .env.local to a valid Organization id. Run the database migration, then npm run db:seed, and copy the printed organization id."
      />
    );
  }

  return (
    <EmptyState
      title="No workspace is associated with this account."
      description="You are signed in, but this account is not a member of a customer workspace. Open Account settings, or contact support if you need access."
      actions={
        <>
          <Link
            href="/settings/account"
            className="font-medium text-ink underline"
          >
            Account settings
          </Link>
          <Link href="/login" className="text-muted underline">
            Switch account
          </Link>
        </>
      }
    />
  );
}

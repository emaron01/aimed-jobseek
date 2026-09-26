import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { enforceEulaAcceptanceGate } from "@/lib/legal/eula-gate";
import { enforcePaymentLockGate } from "@/lib/billing/payment-lock-gate";
import { brand } from "@/lib/product-config";

/**
 * Minimal chrome for post-verify EULA / subscribe — no AppShell / checkout-gate.
 * EULA gate runs here so unpaid users cannot skip terms via /onboarding/subscribe.
 * Payment-locked orgs are sent to /settings/billing (not the subscribe pitch).
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCurrentUser();
  await enforceEulaAcceptanceGate();
  await enforcePaymentLockGate();
  const organization = await getCurrentOrganization();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-edge bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <p className="text-sm font-medium tracking-tight">
            {organization?.name ?? brand.appName}
          </p>
          <Link
            href="/settings/billing"
            className="text-xs text-subtle hover:text-ink"
          >
            Billing
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10">{children}</main>
    </div>
  );
}

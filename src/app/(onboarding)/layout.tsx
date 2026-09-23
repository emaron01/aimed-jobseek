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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <p className="text-sm font-medium tracking-tight">
            {organization?.name ?? brand.appName}
          </p>
          <Link
            href="/settings/billing"
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            Billing
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10">{children}</main>
    </div>
  );
}

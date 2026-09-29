import { AppShell } from "@/components/AppShell";
import { enforceSelfServeCheckoutGate } from "@/lib/billing/checkout-gate";
import { enforcePaymentLockGate } from "@/lib/billing/payment-lock-gate";
import { getOrganizationPaymentLockState } from "@/lib/billing/payment-lock";
import { enforceEulaAcceptanceGate } from "@/lib/legal/eula-gate";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await enforceEulaAcceptanceGate();
  await enforceSelfServeCheckoutGate();
  await enforcePaymentLockGate();

  const organization = await getCurrentOrganization();
  const lockState = organization
    ? await getOrganizationPaymentLockState(organization.id)
    : null;

  return (
    <AppShell
      paymentLocked={false}
      accountReadOnly={Boolean(lockState?.readOnly)}
      cancelAtPeriodEnd={Boolean(lockState?.profile?.cancelAtPeriodEnd)}
      currentPeriodEnd={lockState?.profile?.currentPeriodEnd ?? null}
    >
      {children}
    </AppShell>
  );
}

import Link from "next/link";
import { requirePlatformSuperAdmin } from "@/lib/auth/authz";
import { PLATFORM_SETTING_BILLING_CATALOG } from "@/lib/billing/billing-catalog";
import {
  ensureBillingCatalogSeeded,
  loadEffectiveBillingCatalog,
} from "@/lib/billing/effective-catalog";
import { hasPlatformSetting } from "@/lib/platform/settings";
import { BillingCatalogSettingsForm } from "@/components/platform/BillingCatalogSettingsForm";

export default async function PlatformCatalogPage() {
  const user = await requirePlatformSuperAdmin();
  await ensureBillingCatalogSeeded(user.id);

  const [effective, hasRow] = await Promise.all([
    loadEffectiveBillingCatalog(),
    hasPlatformSetting(PLATFORM_SETTING_BILLING_CATALOG),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-subtle">
          <Link href="/platform" className="underline">
            Platform
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Plan Catalog
        </h1>
        <p className="mt-1 text-sm text-muted">
          Marketing copy, feature bullets, and entitlement floors for new
          Checkout. No Stripe Price IDs here — those live on Billing Config.
          Existing subscribers keep their stored org policies. SUPER_ADMIN only.
        </p>
      </div>

      <section className="rounded-lg border border-edge bg-surface p-5">
        <BillingCatalogSettingsForm
          plans={effective.catalog.plans}
          sourceLabel={effective.sourceLabel}
          hasConsoleRow={hasRow}
        />
      </section>
    </div>
  );
}

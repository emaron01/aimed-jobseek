import { PRIMARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/authz";
import { isEmailVerified } from "@/lib/auth/account-policy";
import { logoutAction } from "@/app/actions/account";
import { updateUserDigestPreferencesAction } from "@/app/actions/cadence";
import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

export default async function AccountSettingsPage() {
  const user = await requireCurrentUser();
  const organization = await getCurrentOrganization();
  const verified = isEmailVerified(user);
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.name ||
    null;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        {organization ? (
          <Link
            href="/settings"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Settings
          </Link>
        ) : null}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Account Settings
        </h1>
      </div>

      <section className="space-y-2 text-sm">
        <p>
          <span className="text-slate-500">Name:</span> {displayName || "—"}
        </p>
        <p>
          <span className="text-slate-500">Email:</span> {user.email}
        </p>
        {user.platformRole === "SUPER_ADMIN" ? (
          <p>
            <span className="text-slate-500">Platform role:</span> SUPER_ADMIN
          </p>
        ) : null}
        {organization ? (
          <p>
            <span className="text-slate-500">Workspace:</span>{" "}
            {organization.name}
          </p>
        ) : null}
        <p>
          <span className="text-slate-500">Verification:</span>{" "}
          {verified ? (
            <span className="text-emerald-700">Verified</span>
          ) : (
            <span className="text-amber-700">
              Unverified —{" "}
              <Link href="/verify-email" className="underline">
                verify now
              </Link>
            </span>
          )}
        </p>
      </section>

      {organization ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Daily digest</h2>
          <p className="text-sm text-slate-600">
            Weekday-morning email when follow-ups are due. Uses your timezone, or
            the organization default ({organization.timezone}).
          </p>
          <ActionFeedbackForm
            action={updateUserDigestPreferencesAction}
            className="grid gap-3 sm:grid-cols-2"
            testId="digest-preferences-form"
          >
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name="digestEnabled"
                defaultChecked={user.digestEnabled}
              />
              Send daily digest when follow-ups are due
            </label>
            <label className="text-sm">
              Send time (local)
              <input
                name="digestSendTimeLocal"
                defaultValue={user.digestSendTimeLocal}
                placeholder="08:00"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Your timezone (optional)
              <input
                name="timezone"
                defaultValue={user.timezone ?? ""}
                placeholder={organization.timezone}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <AppButton
              type="submit"
              className={cn(PRIMARY_BUTTON_CLASS, "sm:col-span-2", "w-fit", "!px-3")}
            >
              Save digest preferences
            </AppButton>
          </ActionFeedbackForm>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Change password</h2>
        <ChangePasswordForm />
      </section>

      <form action={logoutAction}>
        <AppButton
          type="submit"
          data-testid="account-log_out"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          Log Out
        </AppButton>
      </form>
    </div>
  );
}

import { PRIMARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { canMutatePlatform, requirePlatformOperator } from "@/lib/auth/authz";
import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import { createPlatformOrganizationAction } from "@/app/actions/platform-orgs";
import { vocabExamples } from "@/lib/product-config";

export default async function PlatformCreateOrgPage() {
  const user = await requirePlatformOperator();
  const canMutate = canMutatePlatform(user.platformRole);

  if (!canMutate) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="text-sm text-slate-600">
          SUPPORT can view organizations but cannot create accounts. Ask a
          SUPER_ADMIN.
        </p>
        <Link href="/platform/orgs" className="text-sm font-medium underline">
          Back to organizations
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/platform/orgs" className="underline">
            Organizations
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Create account
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Choose billed or comped, set limits, and invite the first OWNER.
          Comped accounts never touch Stripe and do not expire.
        </p>
      </div>

      <ActionFeedbackForm
        action={createPlatformOrganizationAction}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
        testId="create-platform-org-form"
      >
        <label className="block text-sm">
          <span className="font-medium text-slate-800">Organization name</span>
          <input
            name="name"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder={vocabExamples.organizationNamePlaceholder}
          />
        </label>
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium text-slate-800">Account type</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="accountType"
              value="INDIVIDUAL"
              defaultChecked
              className="mt-1"
            />
            <span>
              <span className="font-medium">Individual</span> — one organization,
              first user is OWNER.
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="accountType"
              value="ENTERPRISE"
              className="mt-1"
            />
            <span>
              <span className="font-medium">Enterprise</span> — more than one
              member; first user is OWNER and can invite teammates.
            </span>
          </label>
        </fieldset>
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium text-slate-800">Billing</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="billingMode"
              value="COMPED"
              defaultChecked
              className="mt-1"
            />
            <span>
              <span className="font-medium">Comped</span> — durable free access,
              no Stripe, no billing email, no expiry. Limits you set below.
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="billingMode"
              value="BILLED"
              className="mt-1"
            />
            <span>
              <span className="font-medium">Billed</span> — Individual accounts
              complete Stripe Checkout; Enterprise accounts are invoiced.
            </span>
          </label>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-800">Included seats</span>
            <input
              name="seatQuantity"
              type="number"
              min={1}
              defaultValue={2}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Used for Enterprise. Individual accounts remain one seat.
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-800">Seat cap</span>
            <input
              name="maxSeats"
              type="number"
              min={1}
              defaultValue={2}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Must be at least the included-seat count.
            </span>
          </label>
        </div>
        <label className="block text-sm">
          <span className="font-medium text-slate-800">
            Active researched company limit
          </span>
          <input
            name="activeResearchedCompanyLimit"
            type="number"
            min={0}
            defaultValue={50}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-800">
            Daily send advisory threshold
          </span>
          <input
            name="dailyEmailSendWarningLimit"
            type="number"
            min={0}
            defaultValue={50}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-800">
            Monthly email send hard limit
          </span>
          <input
            name="monthlyEmailSendLimit"
            type="number"
            min={0}
            placeholder="Empty = none (typical for comps); 1000 for billed"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Leave blank for no monthly hard block. Billed defaults to 1000 when
            blank.
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-800">
            First user email (OWNER)
          </span>
          <input
            name="ownerEmail"
            type="email"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="friend@example.com"
          />
        </label>
        <button
          type="submit"
          className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
        >
          Create and send invite
        </button>
      </ActionFeedbackForm>
    </div>
  );
}

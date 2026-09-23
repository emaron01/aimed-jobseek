import { PRIMARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import {
  loadCadencePolicyForSettings,
  updateOrganizationCadencePolicyAction,
} from "@/app/actions/cadence";
import { requireOrgAdmin } from "@/lib/org/authz";
import { vocab } from "@/lib/product-config";

export default async function CadenceSettingsPage() {
  const { organization } = await requireOrgAdmin();
  const { policy, display } = await loadCadencePolicyForSettings(organization.id);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link
          href="/settings/organization"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Organization
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Email cadence
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Follow-up timing for {organization.name}. Intervals below are shown as
          cumulative days from the first send; gaps are stored internally.
        </p>
      </div>

      <section className="space-y-3">
        <ActionFeedbackForm
          action={updateOrganizationCadencePolicyAction}
          className="grid gap-3 sm:grid-cols-2"
          testId="cadence-policy-form"
        >
          <label className="text-sm sm:col-span-2">
            Email 2 (day)
            <input
              name="email2Day"
              type="number"
              min={1}
              defaultValue={display.email2Day}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Cumulative days after the initial email.
            </span>
          </label>
          <label className="text-sm sm:col-span-2">
            Email 3 (day)
            <input
              name="email3Day"
              type="number"
              min={2}
              defaultValue={display.email3Day}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Email 4 (day)
            <input
              name="email4Day"
              type="number"
              min={3}
              defaultValue={display.email4Day}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Repeat (every N days after email 4+)
            <input
              name="repeatEveryDays"
              type="number"
              min={1}
              defaultValue={display.repeatEveryDays}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Only applies when max {vocab.sequence.singular} is unlimited.
            </span>
          </label>
          <label className="text-sm sm:col-span-2">
            Max emails in {vocab.sequence.singular}
            <select
              name="maxSequenceEmails"
              defaultValue={
                policy.maxSequenceEmails == null
                  ? "unlimited"
                  : String(policy.maxSequenceEmails)
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="4">4 (initial + 3 follow-ups, then stop)</option>
              <option value="5">5</option>
              <option value="6">6</option>
              <option value="unlimited">Unlimited (includes 30-day repeat)</option>
            </select>
          </label>
          <button
            type="submit"
            className={cn(PRIMARY_BUTTON_CLASS, "sm:col-span-2", "w-fit", "!px-3")}
          >
            Save cadence policy
          </button>
        </ActionFeedbackForm>
      </section>
    </div>
  );
}

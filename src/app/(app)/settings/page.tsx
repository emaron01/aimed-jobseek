import Link from "next/link";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";
import {
  getMembershipForCurrentUser,
  canManageOrganizationPolicy,
} from "@/lib/org/authz";
import { ensureOrganizationPolicies } from "@/lib/usage/policy";
import { vocab } from "@/lib/product-config";

export default async function SettingsIndexPage() {
  const organization = await requireOrganization();
  await ensureOrganizationPolicies(organization.id);
  const { membership } = await getMembershipForCurrentUser(organization.id);
  const isAdmin = canManageOrganizationPolicy(membership.role);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Workspace configuration for {organization.name}.
        </p>
      </div>

      <ul className="space-y-3 text-sm">
        <li>
          <Link
            href="/settings/account"
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            Account
          </Link>
          <p className="text-slate-600">
            Profile, email verification, password, and logout.
          </p>
        </li>
        <li>
          <Link
            href="/settings/hiring-team"
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            {vocab.persona.nav} templates
          </Link>
          <p className="text-slate-600">
            Starting points for the {vocab.persona.plural} on each {vocab.campaign.singular}.
          </p>
        </li>
        <li>
          <Link
            href="/settings/voice"
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            Your Voice
          </Link>
          <p className="text-slate-600">
            Writing samples for generated emails.
          </p>
        </li>
        <li>
          <Link
            href="/settings/usage"
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            Usage & limits
          </Link>
          <p className="text-slate-600">
            Effective quotas, metering, and research depth.
          </p>
        </li>
        <li>
          <Link
            href="/settings/email"
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            Email connection
          </Link>
          <p className="text-slate-600">
            Connect your Microsoft 365 mailbox and set the signature appended
            when you send.
          </p>
        </li>
        {isAdmin ? (
          <>
            <li>
              <Link
                href="/settings/organization"
                className="font-medium text-slate-900 underline-offset-2 hover:underline"
              >
                Organization
              </Link>
              <p className="text-slate-600">
                Name, timezone, policies, members, and invitations.
              </p>
            </li>
            <li>
              <Link
                href="/settings/billing"
                className="font-medium text-slate-900 underline-offset-2 hover:underline"
              >
                Billing
              </Link>
              <p className="text-slate-600">
                Plan and status (free until Stripe). Payment management later.
              </p>
            </li>
            <li>
              <Link
                href="/settings/cadence"
                className="font-medium text-slate-900 underline-offset-2 hover:underline"
              >
                Email cadence
              </Link>
              <p className="text-slate-600">
                Follow-up intervals and max {vocab.sequence.singular} length.
              </p>
            </li>
          </>
        ) : null}
      </ul>
    </div>
  );
}

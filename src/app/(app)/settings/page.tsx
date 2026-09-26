import Link from "next/link";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";
import {
  getMembershipForCurrentUser,
  canManageOrganizationPolicy,
} from "@/lib/org/authz";
import { ensureOrganizationPolicies } from "@/lib/usage/policy";
import { PageHeader } from "@/components/ui";
import { polishCopy, vocab } from "@/lib/product-config";

export const metadata = { title: polishCopy.settingsTitle };

export default async function SettingsIndexPage() {
  const organization = await requireOrganization();
  await ensureOrganizationPolicies(organization.id);
  const { membership } = await getMembershipForCurrentUser(organization.id);
  const isAdmin = canManageOrganizationPolicy(membership.role);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={polishCopy.settingsTitle}
        description={`${polishCopy.settingsHelp} ${organization.name}.`}
      />

      <ul className="space-y-3 text-sm">
        <li>
          <Link
            href="/settings/account"
            className="font-medium text-ink underline-offset-2 hover:underline"
          >
            Account
          </Link>
          <p className="text-muted">
            Profile, email verification, password, and logout.
          </p>
        </li>
        <li>
          <Link
            href="/settings/hiring-team"
            className="font-medium text-ink underline-offset-2 hover:underline"
          >
            {vocab.persona.nav} templates
          </Link>
          <p className="text-muted">
            Starting points for the {vocab.persona.plural} on each {vocab.campaign.singular}.
          </p>
        </li>
        <li>
          <Link
            href="/settings/voice"
            className="font-medium text-ink underline-offset-2 hover:underline"
          >
            Your voice
          </Link>
          <p className="text-muted">
            Writing samples for generated emails.
          </p>
        </li>
        <li>
          <Link
            href="/settings/usage"
            className="font-medium text-ink underline-offset-2 hover:underline"
          >
            Usage & limits
          </Link>
          <p className="text-muted">
            Effective limits, metering, and research depth.
          </p>
        </li>
        <li>
          <Link
            href="/settings/email"
            className="font-medium text-ink underline-offset-2 hover:underline"
          >
            Email signature
          </Link>
          <p className="text-muted">
            Signature appended when you open a draft in Outlook or Gmail.
          </p>
        </li>
        {isAdmin ? (
          <>
            <li>
              <Link
                href="/settings/organization"
                className="font-medium text-ink underline-offset-2 hover:underline"
              >
                Organization
              </Link>
              <p className="text-muted">
                Name, timezone, policies, members, and invitations.
              </p>
            </li>
            <li>
              <Link
                href="/settings/billing"
                className="font-medium text-ink underline-offset-2 hover:underline"
              >
                Billing
              </Link>
              <p className="text-muted">
                Plan and status (free until Stripe). Payment management later.
              </p>
            </li>
            <li>
              <Link
                href="/settings/cadence"
                className="font-medium text-ink underline-offset-2 hover:underline"
              >
                Email cadence
              </Link>
              <p className="text-muted">
                Follow-up intervals and max {vocab.sequence.singular} length.
              </p>
            </li>
          </>
        ) : null}
      </ul>
    </div>
  );
}

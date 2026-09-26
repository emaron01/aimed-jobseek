import Link from "next/link";
import { HomeSetupRail } from "@/components/HomeSetupRail";
import { PageHeader, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TenantMissing, AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ShowArchivedToggle } from "@/components/ShowArchivedToggle";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getHomeWorkflow } from "@/lib/workflow/home";
import { ApplicationRemindersPanel } from "@/components/ApplicationRemindersPanel";
import { DueContactsPanel } from "@/components/DueContactsPanel";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { canViewAllRepWork } from "@/lib/work/ownership";
import { anyListFeatureEnabled, vocab } from "@/lib/product-config";

function HomeNavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className={SECONDARY_BUTTON_CLASS}
    >
      {label}
    </Link>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const [organization, user] = await Promise.all([
    getCurrentOrganization(),
    getCurrentUser(),
  ]);
  const query = await searchParams;
  const includeArchived = query.archived === "1";

  if (!organization) {
    if (user?.platformRole === "SUPER_ADMIN") {
      redirect("/settings/account");
    }
    if (user) {
      redirect("/no-workspace");
    }
    return (
      <div>
        <PageHeader
          title="Home"
          description={`Organization-scoped overview of ${vocab.contact.plural} and ${vocab.campaign.plural}.`}
        />
        <TenantMissing />
      </div>
    );
  }

  const membership = await getMembershipForCurrentUser(organization.id);
  const workflow = await getHomeWorkflow(organization.id, {
    includeArchived,
    userId: user?.id,
    canViewAllRepWork: canViewAllRepWork(membership.membership.role),
  });

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Home"
        description={`Track ${vocab.campaign.plural} for ${organization.name}: apply through the employer portal, then write outreach when you find people on the Hiring Team.`}
        actions={
          <>
            <ShowArchivedToggle
              href={includeArchived ? "/" : "/?archived=1"}
              includeArchived={includeArchived}
              label={vocab.campaign.plural}
            />
            {anyListFeatureEnabled() ? (
              <HomeNavLink href="/lists" label={vocab.list.Plural} />
            ) : null}
            <HomeNavLink href="/campaigns" label={vocab.campaign.Plural} />
          </>
        }
      />

      <div className="mb-6">
        <h2 className="mb-3 text-center text-lg font-semibold text-ink">
          Setup
        </h2>
        <HomeSetupRail
          steps={workflow.setupRail}
          focusKey={workflow.setupFocus}
        />
      </div>

      <ApplicationRemindersPanel reminders={workflow.applicationReminders} />
      {anyListFeatureEnabled() && workflow.dueByCampaign.length > 0 ? (
        <DueContactsPanel dueByCampaign={workflow.dueByCampaign} />
      ) : null}

      <div className="mt-8 mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-ink">{vocab.campaign.Plural}</h2>
        {workflow.setupComplete ? (
          <Link
            href="/campaigns/new"
            className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
          >
            New {vocab.campaign.singular}
          </Link>
        ) : (
          <AppButton
            type="button"
            disabled
            title={`Finish ${vocab.product.singular} setup first`}
            className="cursor-not-allowed rounded-md bg-edge-strong px-3 py-2 text-sm font-medium text-subtle"
          >
            New {vocab.campaign.singular}
          </AppButton>
        )}
      </div>
      {!workflow.setupComplete ? (
        <p className="mb-4 text-sm text-subtle">
          {vocab.campaign.Singular} creation unlocks after at least one {vocab.product.singular} is approved with {vocab.icp.aSingular} that has criteria. Voice samples are
          optional. Existing {vocab.campaign.plural} stay available.
        </p>
      ) : null}
      {workflow.campaigns.length === 0 ? (
        <section className="rounded-xl border border-dashed border-edge-strong bg-surface p-8 text-center">
          <h3 className="font-semibold text-ink">
            {workflow.setupComplete
              ? `Start your first ${vocab.campaign.singular}`
              : `No ${vocab.campaign.plural} yet`}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {workflow.setupComplete
              ? `Select the setup you already approved, then paste a job posting.`
              : `Finish ${vocab.product.singular} setup to create ${vocab.campaign.aSingular}.`}
          </p>
          {workflow.setupComplete ? (
            <Link
              href="/campaigns/new"
              className={cn(PRIMARY_BUTTON_CLASS, "mt-4", "!px-3")}
            >
              New {vocab.campaign.singular}
            </Link>
          ) : null}
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {workflow.campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/campaigns/${campaign.id}`}
              className="rounded-xl border border-edge bg-surface p-5 transition hover:border-edge-strong"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-ink">
                    {campaign.name}
                    {campaign.archived ? (
                      <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
                        Archived
                      </span>
                    ) : null}
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    {campaign.context || `${vocab.campaign.Singular} setup`}
                  </p>
                </div>
                {campaign.emailsToWrite > 0 ? (
                  <span className="rounded-full bg-warning-tint px-2.5 py-1 text-sm font-semibold text-warning">
                    {campaign.emailsToWrite} outreach to write
                  </span>
                ) : null}
              </div>
              <dl className="mt-5 grid grid-cols-4 gap-3 text-sm">
                <div>
                  <dt className="text-subtle">{vocab.account.Plural}</dt>
                  <dd className="font-semibold">{campaign.companies}</dd>
                </div>
                <div>
                  <dt className="text-subtle">On the roster</dt>
                  <dd className="font-semibold">{campaign.qualified}</dd>
                </div>
                <div>
                  <dt className="text-subtle">{vocab.contact.Plural}</dt>
                  <dd className="font-semibold">{campaign.contacts}</dd>
                </div>
                <div>
                  <dt className="text-subtle">Outreach to write</dt>
                  <dd className="font-semibold">{campaign.emailsToWrite}</dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

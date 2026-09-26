import Link from "next/link";
import { notFound } from "next/navigation";
import { ScoreListForm } from "@/components/ScoreListForm";
import { PageHeader, Panel, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import {
  listDetailHref,
  parseCampaignId,
} from "@/lib/lists/campaign-query";
import {
  getCampaignForListWorkflow,
  getContactList,
  listIcps,
  listPersonas,
  listProducts,
} from "@/lib/tenant/data";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { features, vocab } from "@/lib/product-config";
import { requireGatedPage } from "@/lib/product-config/feature-access";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ campaign?: string }>;
};

export default async function ScoreListPage({ params, searchParams }: PageProps) {
  requireGatedPage("listBulkScoring");
  const organization = await getCurrentOrganization();
  const { id } = await params;
  const campaignId = parseCampaignId((await searchParams).campaign);

  if (!organization) {
    return (
      <div>
        <PageHeader title={`Score ${vocab.list.Singular}`} description="Create a scoring run." />
        <TenantMissing />
      </div>
    );
  }

  let list;
  try {
    list = await getContactList(id);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  const [products, icps, personas, campaign] = await Promise.all([
    listProducts(),
    listIcps(),
    listPersonas(),
    campaignId ? getCampaignForListWorkflow(campaignId) : Promise.resolve(null),
  ]);
  const membership = await getMembershipForCurrentUser(organization.id);
  const readOnly = list.ownerUserId !== membership.user.id;

  const readyProducts = products.filter((product) => {
    const hasIcp = icps.some((icp) => icp.productId === product.id);
    const hasPersona = personas.some(
      (persona) => persona.productId === product.id,
    );
    return hasIcp && hasPersona;
  });

  return (
    <div>
      <PageHeader
        title={
          campaign ? `Score for ${campaign.name}: ${list.name}` : `Score: ${list.name}`
        }
        description={`Select ${vocab.product.Singular} → ${vocab.icp.singular} → ${vocab.persona.Singular}. Default is All ${vocab.persona.plural} so mixed ${vocab.list.plural} are scored against every ${vocab.buyer.singular}.`}
        actions={
          <Link
            href={listDetailHref(id, { campaignId: campaign?.id })}
            className={SECONDARY_BUTTON_CLASS}
          >
            Back to {vocab.list.singular}
          </Link>
        }
      />

      <Panel
        title="Create Scoring Run"
        description="No AI scoring runs yet. This creates the report framework with pending/null score fields."
      >
        {readOnly ? (
          <p className="text-sm text-muted">
            Manager access is read-only. Only{" "}
            {list.owner.name?.trim() || list.owner.email} can score this {vocab.list.singular}.
          </p>
        ) : list.archivedAt ? (
          <p className="text-sm text-muted">
            This {vocab.list.singular} is archived and cannot be scored until it is unarchived.
          </p>
        ) : readyProducts.length === 0 ? (
          <p className="text-sm text-muted">
            Add a {vocab.product.Singular} with at least one {vocab.icp.singular} and one {vocab.persona.Singular} on the{" "}
            <Link href="/products" className="underline">
              {vocab.product.Plural} page
            </Link>{" "}
            first.
          </p>
        ) : !features.listBulkScoring ? (
          <p className="text-sm text-muted">
            Scoring is not available for this {vocab.list.singular}.
          </p>
        ) : (
          <ScoreListForm
            contactListId={list.id}
            products={readyProducts.map((product) => ({
              id: product.id,
              name: product.name,
            }))}
            icps={icps.map((icp) => ({
              id: icp.id,
              name: icp.name,
              productId: icp.productId,
            }))}
            personas={personas.map((persona) => ({
              id: persona.id,
              name: persona.name,
              productId: persona.productId,
            }))}
            defaultProductId={campaign?.productId}
            defaultIcpId={campaign?.icpId}
            defaultPersonaId={campaign?.personaId}
            campaignId={campaign?.id}
          />
        )}
      </Panel>
    </div>
  );
}

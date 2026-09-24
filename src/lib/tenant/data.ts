import "server-only";

import type {
  Campaign,
  CampaignStatus,
  Contact,
  ContactList,
  ContactScore,
  EmailLength,
  Icp,
  Offer,
  Persona,
  Product,
  Prisma,
  ResearchStatus,
  ScoreLabel,
  ScoringRun,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  snapshotIcp,
  snapshotPersona,
  snapshotProduct,
} from "@/lib/scoring/snapshots";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import {
  CAMPAIGN_LIST_VIEW_MY,
  CAMPAIGN_LIST_VIEW_SHARED_ALL,
  canViewAllCampaigns,
  type CampaignListViewMode,
} from "@/lib/campaign/visibility";
import { normalizeContactEmail } from "@/lib/contact/identity";
import { upsertContactIntoList } from "@/lib/contact/upsert";
import { requireOrganizationId, TenantError } from "@/lib/tenant/getCurrentOrganization";
import {
  deleteCampaignGraph,
  type CampaignDeleteImpact,
} from "@/lib/tenant/campaign-delete";
import {
  deletePersonaAssistedSetupGraph,
  deleteProductAssistedSetupGraph,
} from "@/lib/tenant/product-persona-delete";
import {
  assertCanModifyOwnedWork,
  getWorkActor,
} from "@/lib/work/ownership";
import { vocab } from "@/lib/product-config";

async function orgId(): Promise<string> {
  return requireOrganizationId();
}

async function currentUserId(): Promise<string> {
  const user = await requireCurrentUser();
  return user.id;
}

function notFound(entity: string): never {
  throw new TenantError(`${entity} not found in the active organization.`);
}

// --- Products ---

export type ProductWithCounts = Product & {
  _count: { icps: number; personas: number; campaigns: number };
};

export async function listProducts(): Promise<Product[]> {
  const organizationId = await orgId();
  return prisma.product.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function listProductsWithCounts(): Promise<ProductWithCounts[]> {
  const organizationId = await orgId();
  return prisma.product.findMany({
    where: { organizationId, archivedAt: null },
    include: {
      _count: {
        select: {
          icps: true,
          personas: true,
          campaigns: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProduct(id: string): Promise<Product> {
  const organizationId = await orgId();
  const product = await prisma.product.findFirst({
    where: { id, organizationId, archivedAt: null },
  });
  if (!product) notFound("Product");
  return product;
}

export async function createProduct(
  data: Omit<Prisma.ProductUncheckedCreateInput, "organizationId" | "id">,
): Promise<Product> {
  const organizationId = await orgId();
  return prisma.product.create({
    data: { ...data, organizationId },
  });
}

export async function updateProduct(
  id: string,
  data: Prisma.ProductUncheckedUpdateInput,
): Promise<Product> {
  const organizationId = await orgId();
  const existing = await prisma.product.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!existing) notFound("Product");

  return prisma.product.update({
    where: { id },
    data: {
      ...data,
      organizationId,
    },
  });
}

export async function deleteProduct(id: string): Promise<{
  mode: "deleted" | "archived";
  message: string;
}> {
  const organizationId = await orgId();
  const existing = await prisma.product.findFirst({
    where: { id, organizationId, archivedAt: null },
    include: {
      _count: {
        select: {
          icps: true,
          personas: true,
          campaigns: true,
          scoringRuns: true,
          sources: true,
          evidenceBundles: true,
          setupRuns: true,
        },
      },
    },
  });
  if (!existing) notFound("Product");

  if (existing._count.campaigns > 0) {
    throw new TenantError(
      `${vocab.product.Singular} could not be deleted because it is still referenced by ${existing._count.campaigns} ${vocab.campaign.singular}(s). Remove or reassign those ${vocab.campaign.plural} first.`,
    );
  }

  // Historical scoring snapshots must remain — soft-archive when ScoringRuns exist.
  if (existing._count.scoringRuns > 0) {
    const now = new Date();
    await prisma.$transaction([
      prisma.product.update({
        where: { id: existing.id },
        data: { archivedAt: now },
      }),
      prisma.persona.updateMany({
        where: { organizationId, productId: existing.id, archivedAt: null },
        data: { archivedAt: now },
      }),
      prisma.icp.updateMany({
        where: { organizationId, productId: existing.id, archivedAt: null },
        data: { archivedAt: now },
      }),
    ]);
    return {
      mode: "archived",
      message: `${vocab.product.Singular} archived because ${existing._count.scoringRuns} scoring run(s) reference it. Historical scoring snapshots were preserved. The ${vocab.product.singular} no longer appears in setup.`,
    };
  }

  // Hard delete live setup graph in FK-safe order (no ScoringRun/Campaign refs).
  // PersonaSetupRun.productEvidenceBundleId is Restrict — cleared inside
  // deleteProductAssistedSetupGraph before ProductEvidenceBundle.
  await prisma.$transaction(async (tx) => {
    await deleteProductAssistedSetupGraph(tx, organizationId, existing.id);

    // Personas (criteria Cascade; PersonaSource Cascade when personaId set)
    await tx.personaCriterion.deleteMany({
      where: {
        organizationId,
        persona: { productId: existing.id },
      },
    });
    await tx.persona.deleteMany({
      where: { organizationId, productId: existing.id },
    });

    await tx.icpCriterion.deleteMany({
      where: {
        organizationId,
        icp: { productId: existing.id },
      },
    });
    await tx.icp.deleteMany({
      where: { organizationId, productId: existing.id },
    });
    await tx.product.delete({ where: { id: existing.id } });
  });

  return {
    mode: "deleted",
    message: `${vocab.product.Singular} deleted.`,
  };
}

async function requireProductInOrg(productId: string): Promise<Product> {
  const organizationId = await orgId();
  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId, archivedAt: null },
  });
  if (!product) {
    throw new TenantError(`${vocab.product.Singular} does not belong to the active organization.`);
  }
  return product;
}

// --- Offers (legacy table retained; not used by Setup UX) ---

export async function listOffers(): Promise<Offer[]> {
  const organizationId = await orgId();
  return prisma.offer.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
}

// --- ICPs ---

export async function listIcps(productId?: string): Promise<Icp[]> {
  const organizationId = await orgId();
  if (productId) {
    await requireProductInOrg(productId);
  }
  return prisma.icp.findMany({
    where: {
      organizationId,
      archivedAt: null,
      ...(productId ? { productId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getIcp(id: string): Promise<Icp> {
  const organizationId = await orgId();
  const icp = await prisma.icp.findFirst({
    where: { id, organizationId },
  });
  if (!icp) notFound("ICP");
  return icp;
}

export async function createIcp(
  data: Omit<Prisma.IcpUncheckedCreateInput, "organizationId" | "id"> & {
    productId: string;
  },
): Promise<Icp> {
  const organizationId = await orgId();
  const product = await requireProductInOrg(data.productId);

  return prisma.icp.create({
    data: {
      ...data,
      organizationId,
      productId: product.id,
    },
  });
}

export async function updateIcp(
  id: string,
  data: Prisma.IcpUncheckedUpdateInput,
): Promise<Icp> {
  const organizationId = await orgId();
  const existing = await prisma.icp.findFirst({
    where: { id, organizationId },
  });
  if (!existing) notFound("ICP");

  // productId reassignment is not allowed via update payload from clients
  const { productId, ...safeData } = data as Prisma.IcpUncheckedUpdateInput & {
    productId?: unknown;
  };
  void productId;

  const updated = await prisma.icp.update({
    where: { id },
    data: {
      ...safeData,
      organizationId,
      productId: existing.productId,
    },
  });
  const { markApplicationFitsStaleForIcp } = await import(
    "@/lib/application/fit-staleness"
  );
  await markApplicationFitsStaleForIcp(organizationId, id);
  return updated;
}

export async function deleteIcp(id: string): Promise<{
  mode: "deleted" | "archived";
  message: string;
}> {
  const organizationId = await orgId();
  const existing = await prisma.icp.findFirst({
    where: { id, organizationId, archivedAt: null },
    include: {
      _count: { select: { campaigns: true, scoringRuns: true } },
    },
  });
  if (!existing) notFound("ICP");

  if (existing._count.campaigns > 0) {
    throw new TenantError(
      `${vocab.icp.singular} could not be deleted because it is still referenced by ${existing._count.campaigns} ${vocab.campaign.singular}(s).`,
    );
  }

  if (existing._count.scoringRuns > 0) {
    await prisma.icp.update({
      where: { id: existing.id },
      data: { archivedAt: new Date() },
    });
    return {
      mode: "archived",
      message: `${vocab.icp.singular} archived because ${existing._count.scoringRuns} scoring run(s) reference it. Historical snapshots were preserved.`,
    };
  }

  await prisma.icp.delete({ where: { id: existing.id } });
  return { mode: "deleted", message: `${vocab.icp.singular} deleted.` };
}

// --- Personas ---

export async function listPersonas(productId?: string): Promise<Persona[]> {
  const organizationId = await orgId();
  if (productId) {
    await requireProductInOrg(productId);
  }
  return prisma.persona.findMany({
    where: {
      organizationId,
      archivedAt: null,
      ...(productId ? { productId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPersona(id: string): Promise<Persona> {
  const organizationId = await orgId();
  const persona = await prisma.persona.findFirst({
    where: { id, organizationId, archivedAt: null },
  });
  if (!persona) notFound("Persona");
  return persona;
}

export async function createPersona(
  data: Omit<Prisma.PersonaUncheckedCreateInput, "organizationId" | "id"> & {
    productId: string;
  },
): Promise<Persona> {
  const organizationId = await orgId();
  const product = await requireProductInOrg(data.productId);

  return prisma.persona.create({
    data: {
      ...data,
      organizationId,
      productId: product.id,
    },
  });
}

export async function updatePersona(
  id: string,
  data: Prisma.PersonaUncheckedUpdateInput,
): Promise<Persona> {
  const organizationId = await orgId();
  const existing = await prisma.persona.findFirst({
    where: { id, organizationId },
  });
  if (!existing) notFound("Persona");

  const { productId, ...safeData } = data as Prisma.PersonaUncheckedUpdateInput & {
    productId?: unknown;
  };
  void productId;

  return prisma.persona.update({
    where: { id },
    data: {
      ...safeData,
      organizationId,
      productId: existing.productId,
    },
  });
}

export async function deletePersona(id: string): Promise<{
  mode: "deleted" | "archived";
  message: string;
}> {
  const organizationId = await orgId();
  const existing = await prisma.persona.findFirst({
    where: { id, organizationId, archivedAt: null },
    include: {
      _count: {
        select: {
          campaigns: true,
          campaignPersonas: true,
          scoringRuns: true,
          criteria: true,
        },
      },
    },
  });
  if (!existing) notFound("Persona");

  if (existing._count.campaigns > 0 || existing._count.campaignPersonas > 0) {
    const campaignCount =
      existing._count.campaigns + existing._count.campaignPersonas;
    throw new TenantError(
      `${vocab.persona.Singular} could not be deleted because it is still referenced by ${campaignCount} ${vocab.campaign.singular}(s). Remove or reassign those ${vocab.campaign.plural} first.`,
    );
  }

  // ScoringRun.personaId is Restrict — preserve immutable history via soft-archive.
  if (existing._count.scoringRuns > 0) {
    await prisma.persona.update({
      where: { id: existing.id },
      data: { archivedAt: new Date() },
    });
    return {
      mode: "archived",
      message: `${vocab.persona.Singular} archived because ${existing._count.scoringRuns} scoring run(s) reference it. Historical scoring snapshots were not changed. The ${vocab.persona.singular} no longer appears in setup.`,
    };
  }

  // Hard delete: clear persona research graph, then Persona (criteria Cascade;
  // PersonaSource rows with personaId Cascade). PersonaEvidenceBundle is
  // Product-scoped — delete only bundles for this Persona's setup runs.
  await prisma.$transaction(async (tx) => {
    await deletePersonaAssistedSetupGraph(tx, organizationId, existing.id);
    await tx.persona.delete({ where: { id: existing.id } });
  });

  return {
    mode: "deleted",
    message: `${vocab.persona.Singular} deleted.`,
  };
}

// --- Contact lists ---

export type ContactListWithOwner = ContactList & {
  owner: { id: string; name: string | null; email: string };
};

export async function listContactLists(options?: {
  includeArchived?: boolean;
}): Promise<ContactListWithOwner[]> {
  const actor = await getWorkActor();
  return prisma.contactList.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(actor.canViewAll ? {} : { ownerUserId: actor.userId }),
      ...(options?.includeArchived ? {} : { archivedAt: null }),
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getContactList(id: string): Promise<ContactListWithOwner> {
  const actor = await getWorkActor();
  const list = await prisma.contactList.findFirst({
    where: {
      id,
      organizationId: actor.organizationId,
      ...(actor.canViewAll ? {} : { ownerUserId: actor.userId }),
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
    },
  });
  if (!list) notFound("Contact list");
  return list;
}

export async function getContactListContacts(
  listId: string,
  options?: { page?: number; pageSize?: number },
): Promise<{
  contacts: Contact[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;
  const list = await prisma.contactList.findFirst({
    where: {
      id: listId,
      organizationId,
      ...(actor.canViewAll ? {} : { ownerUserId: actor.userId }),
    },
    select: { id: true },
  });
  if (!list) notFound("Contact list");

  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 50));
  const skip = (page - 1) * pageSize;
  const memberWhere = {
    organizationId,
    archivedAt: null,
    memberships: { some: { contactListId: listId } },
  };

  const [total, contacts] = await Promise.all([
    prisma.contact.count({ where: memberWhere }),
    prisma.contact.findMany({
      where: memberWhere,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { createdAt: "asc" }],
      skip,
      take: pageSize,
    }),
  ]);

  return { contacts, total, page, pageSize };
}

export async function findExistingContactsForDuplicateCheck(): Promise<
  Array<{
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
  }>
> {
  const actor = await getWorkActor();
  return prisma.contact.findMany({
    where: {
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
    },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      company: true,
    },
  });
}

export type ImportContactInput = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  company: string | null;
  companyWebsite: string | null;
  industry: string | null;
  employeeCount: number | null;
  revenue: number | null;
  location: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  rawData: Record<string, string>;
};

export async function importContactList(input: {
  name: string;
  sourceType: "PASTE" | "UPLOAD";
  originalFilename?: string | null;
  contacts: ImportContactInput[];
}): Promise<{
  listId: string;
  importedCount: number;
  suppressedCount: number;
  emailMissingCount: number;
  mergedCount: number;
  titleChangedCount: number;
}> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;
  const userId = actor.userId;
  const name = input.name.trim();

  if (!name) {
    throw new TenantError(`${vocab.list.Singular} name is required.`);
  }
  if (input.contacts.length === 0) {
    throw new TenantError(`No ${vocab.contact.plural} to import.`);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const list = await tx.contactList.create({
        data: {
          organizationId,
          ownerUserId: userId,
          name,
          sourceType: input.sourceType,
          originalFilename: input.originalFilename?.trim() || null,
          totalContacts: 0,
          createdByUserId: userId,
        },
      });

      let importedCount = 0;
      let emailMissingCount = 0;
      let mergedCount = 0;
      let titleChangedCount = 0;
      const memberContactIds = new Set<string>();

      for (const contact of input.contacts) {
        const upserted = await upsertContactIntoList(tx, {
          organizationId,
          ownerUserId: userId,
          createdByUserId: userId,
          addedByUserId: userId,
          contactListId: list.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          title: contact.title,
          company: contact.company,
          companyWebsite: contact.companyWebsite,
          industry: contact.industry,
          employeeCount: contact.employeeCount,
          revenue: contact.revenue,
          location: contact.location,
          linkedinUrl: contact.linkedinUrl,
          phone: contact.phone,
          rawData: contact.rawData,
        });
        memberContactIds.add(upserted.contact.id);
        importedCount += 1;
        if (upserted.emailMissing) emailMissingCount += 1;
        if (upserted.merged) mergedCount += 1;
        if (upserted.titleChanged) titleChangedCount += 1;
      }

      await tx.contactList.update({
        where: { id: list.id },
        data: { totalContacts: memberContactIds.size },
      });

      const { listActiveNormalizedEmails, contactMatchesSuppressionSet } =
        await import("@/lib/suppression/service");
      const suppressed = await listActiveNormalizedEmails(
        organizationId,
        input.contacts.map((contact) => contact.email),
        tx,
      );
      let suppressedCount = 0;
      for (const contact of input.contacts) {
        if (contactMatchesSuppressionSet(contact.email, suppressed)) {
          suppressedCount += 1;
        }
      }

      return {
        listId: list.id,
        importedCount,
        suppressedCount,
        emailMissingCount,
        mergedCount,
        titleChangedCount,
      };
    });

    return result;
  } catch (error) {
    console.error("importContactList failed", error);
    throw new TenantError(`Import failed. No partial ${vocab.list.singular} was left behind.`);
  }
}

// --- Contacts ---

export type ContactWithMemberships = Contact & {
  owner: { id: string; name: string | null; email: string };
  memberships: Array<{
    contactList: { id: string; name: string; archivedAt: Date | null };
  }>;
};

export async function listContacts(options?: {
  listId?: string;
  search?: string;
  /** When true, include contacts with no list memberships. Default hides them. */
  includeUnlisted?: boolean;
  includeArchivedContacts?: boolean;
}): Promise<ContactWithMemberships[]> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;
  const listId = options?.listId?.trim() || undefined;
  const search = options?.search?.trim() || undefined;
  const includeUnlisted = options?.includeUnlisted === true;
  const includeArchivedContacts = options?.includeArchivedContacts === true;

  if (listId) {
    const list = await prisma.contactList.findFirst({
      where: {
        id: listId,
        organizationId,
        ...(actor.canViewAll ? {} : { ownerUserId: actor.userId }),
      },
      select: { id: true },
    });
    if (!list) notFound("Contact list");
  }

  const membershipFilter: Prisma.ContactWhereInput = listId
    ? { memberships: { some: { contactListId: listId } } }
    : includeArchivedContacts
      ? includeUnlisted
        ? {}
        : { memberships: { some: {} } }
      : includeUnlisted
        ? {
            // Unlisted OR on an active list — hide archived-list-only contacts.
            OR: [
              { memberships: { none: {} } },
              {
                memberships: {
                  some: { contactList: { archivedAt: null } },
                },
              },
            ],
          }
        : {
            // Default: only contacts with at least one non-archived list.
            memberships: {
              some: { contactList: { archivedAt: null } },
            },
          };

  const searchFilter: Prisma.ContactWhereInput | null = search
    ? {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { company: { contains: search, mode: "insensitive" } },
          { title: { contains: search, mode: "insensitive" } },
        ],
      }
    : null;

  return prisma.contact.findMany({
    where: {
      organizationId,
      ...(actor.canViewAll ? {} : { ownerUserId: actor.userId }),
      ...(includeArchivedContacts ? {} : { archivedAt: null }),
      AND: [membershipFilter, ...(searchFilter ? [searchFilter] : [])],
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      memberships: {
        include: {
          contactList: {
            select: { id: true, name: true, archivedAt: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

// --- Campaigns ---

export type CampaignWithRelations = Campaign & {
  owner: { id: string; name: string | null; email: string };
  product: { id: string; name: string };
  icp: { id: string; name: string };
  persona: { id: string; name: string } | null;
  personasInPlay: Array<{ persona: { id: string; name: string } }>;
  offer: { id: string; name: string } | null;
  _count: { contacts: number };
};

export async function listCampaigns(options?: {
  includeArchived?: boolean;
  view?: CampaignListViewMode;
  userId?: string;
}): Promise<CampaignWithRelations[]> {
  const organizationId = await orgId();
  const view = options?.view ?? CAMPAIGN_LIST_VIEW_MY;
  let userId = options?.userId ?? null;
  if (!userId) {
    userId = await currentUserId();
  }
  if (!userId) {
    throw new TenantError(`Sign in required to list ${vocab.campaign.plural}.`);
  }

  let canViewEveryCampaign = false;
  if (view === CAMPAIGN_LIST_VIEW_SHARED_ALL) {
    const ctx = await getMembershipForCurrentUser(organizationId);
    canViewEveryCampaign = canViewAllCampaigns(ctx.membership.role);
  }

  const archivedFilter = options?.includeArchived
    ? {}
    : { archivedAt: null };

  let visibilityWhere: Prisma.CampaignWhereInput = {};
  if (view === CAMPAIGN_LIST_VIEW_MY) {
    visibilityWhere = {
      ownerUserId: userId,
    };
  } else if (view === CAMPAIGN_LIST_VIEW_SHARED_ALL) {
    // Managers need a complete org-wide campaign index. Members see only
    // templates deliberately shared with the organization.
    visibilityWhere = canViewEveryCampaign ? {} : { visibility: "SHARED" };
  }

  return prisma.campaign.findMany({
    where: {
      organizationId,
      ...archivedFilter,
      ...visibilityWhere,
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      product: { select: { id: true, name: true } },
      icp: { select: { id: true, name: true } },
      persona: { select: { id: true, name: true } },
      personasInPlay: {
        include: { persona: { select: { id: true, name: true } } },
      },
      offer: { select: { id: true, name: true } },
      _count: {
        select: { contacts: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createCampaign(input: {
  name: string;
  productId: string;
  icpId: string;
  personaId?: string | null;
  personaIds?: string[];
  offerName?: string | null;
  offerDescription?: string | null;
  offerCta?: string | null;
  offerNotes?: string | null;
  offerValidationJson?: Prisma.InputJsonValue | null;
  offerValidationHash?: string | null;
  emailLength?: EmailLength;
  emailGuidance?: string | null;
  contactIds?: string[];
  status?: CampaignStatus;
}): Promise<Campaign> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;

  const inPlayIds = Array.from(
    new Set((input.personaIds ?? []).map((id) => id.trim()).filter(Boolean)),
  );

  const [product, icp, fallbackPersona, inPlayPersonas] = await Promise.all([
    prisma.product.findFirst({
      where: { id: input.productId, organizationId },
      select: { id: true, organizationId: true },
    }),
    prisma.icp.findFirst({
      where: { id: input.icpId, organizationId },
      select: { id: true, organizationId: true, productId: true },
    }),
    input.personaId
      ? prisma.persona.findFirst({
          where: { id: input.personaId, organizationId, archivedAt: null },
          select: { id: true, organizationId: true, productId: true },
        })
      : Promise.resolve(null),
    inPlayIds.length > 0
      ? prisma.persona.findMany({
          where: {
            id: { in: inPlayIds },
            organizationId,
            archivedAt: null,
          },
          select: { id: true, productId: true },
        })
      : Promise.resolve([]),
  ]);

  if (!product) {
    throw new TenantError(`${vocab.product.Singular} does not belong to the active organization.`);
  }
  if (!icp) {
    throw new TenantError(`${vocab.icp.singular} does not belong to the active organization.`);
  }
  if (input.personaId && !fallbackPersona) {
    throw new TenantError(`${vocab.persona.Singular} does not belong to the active organization.`);
  }
  if (icp.productId !== product.id) {
    throw new TenantError(`${vocab.icp.singular} does not belong to the selected ${vocab.product.singular}.`);
  }
  if (fallbackPersona && fallbackPersona.productId !== product.id) {
    throw new TenantError(`${vocab.persona.Singular} does not belong to the selected ${vocab.product.singular}.`);
  }
  if (inPlayPersonas.length !== inPlayIds.length) {
    throw new TenantError(
      `One or more ${vocab.persona.plural} do not belong to the active organization.`,
    );
  }
  if (inPlayPersonas.some((persona) => persona.productId !== product.id)) {
    throw new TenantError(`${vocab.persona.Singular} does not belong to the selected ${vocab.product.singular}.`);
  }

  const fallbackPersonaId =
    fallbackPersona?.id ??
    (inPlayIds.length === 1 ? inPlayIds[0]! : null);

  const contactIds = Array.from(
    new Set((input.contactIds ?? []).map((id) => id.trim()).filter(Boolean)),
  );

  if (contactIds.length > 0) {
    const contacts = await prisma.contact.findMany({
      where: {
        organizationId,
        ownerUserId: actor.userId,
        id: { in: contactIds },
        archivedAt: null,
      },
      select: {
        id: true,
        email: true,
        normalizedEmail: true,
        memberships: {
          select: {
            contactList: { select: { archivedAt: true } },
          },
        },
      },
    });
    if (contacts.length !== contactIds.length) {
      throw new TenantError(
        `One or more selected ${vocab.contact.plural} do not belong to the active organization.`,
      );
    }
    if (
      contacts.some((contact) =>
        contact.memberships.every(
          (membership) => membership.contactList.archivedAt != null,
        ) && contact.memberships.length > 0,
      )
    ) {
      throw new TenantError(
        `${vocab.contact.Plural} whose only ${vocab.list.plural} are archived cannot be added to ${vocab.campaign.aSingular}.`,
      );
    }
    if (
      contacts.some(
        (contact) =>
          !contact.normalizedEmail && !normalizeContactEmail(contact.email),
      )
    ) {
      throw new TenantError(
        `${vocab.contact.Plural} without an email address cannot be added to ${vocab.campaign.aSingular}.`,
      );
    }
    const { listActiveNormalizedEmails, contactMatchesSuppressionSet } =
      await import("@/lib/suppression/service");
    const suppressed = await listActiveNormalizedEmails(
      organizationId,
      contacts.map((contact) => contact.email),
    );
    if (contacts.some((contact) => contactMatchesSuppressionSet(contact.email, suppressed))) {
      throw new TenantError(
        `One or more selected ${vocab.contact.plural} are on the organization do-not-contact list.`,
      );
    }
  }

  const actorUserId = actor.userId;

  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        organizationId,
        ownerUserId: actorUserId,
        visibility: "PERSONAL",
        name: input.name,
        productId: product.id,
        icpId: icp.id,
        personaId: fallbackPersonaId,
        offerId: null,
        offerName: input.offerName?.trim() || null,
        offerDescription: input.offerDescription?.trim() || null,
        offerCta: input.offerCta?.trim() || null,
        offerNotes: input.offerNotes?.trim() || null,
        offerValidationJson: input.offerValidationJson ?? undefined,
        offerValidationHash: input.offerValidationHash ?? null,
        emailLength: input.emailLength ?? "MEDIUM",
        emailGuidance: input.emailGuidance?.trim() || null,
        status: input.status ?? "DRAFT",
      },
    });

    if (inPlayIds.length > 0) {
      await tx.campaignPersona.createMany({
        data: inPlayIds.map((personaId) => ({
          organizationId,
          campaignId: campaign.id,
          personaId,
        })),
      });
    }

    if (contactIds.length > 0) {
      await tx.campaignContact.createMany({
        data: contactIds.map((contactId) => ({
          organizationId,
          campaignId: campaign.id,
          contactId,
          selected: true,
          status: "SELECTED",
        })),
      });
    }

    return campaign;
  });
}

export async function deleteCampaign(id: string): Promise<{
  mode: "deleted";
  message: string;
  impact: CampaignDeleteImpact;
}> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;
  const existing = await prisma.campaign.findFirst({
    where: { id, organizationId },
    select: { id: true, ownerUserId: true },
  });
  if (!existing) notFound("Campaign");
  assertCanModifyOwnedWork(actor, existing.ownerUserId, "Campaign");

  const impact = await prisma.$transaction((tx) =>
    deleteCampaignGraph(tx, organizationId, existing.id),
  );

  return {
    mode: "deleted",
    message: `${vocab.campaign.Singular} deleted. Removed ${impact.contactCount} ${vocab.contact.singular}(s), ${impact.draftCount} draft(s), and ${impact.sentCount} sent email(s).`,
    impact,
  };
}

export async function assertContactBelongsToOrg(contactId: string): Promise<void> {
  const organizationId = await orgId();
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    select: { id: true },
  });
  if (!contact) {
    throw new TenantError(`${vocab.contact.Singular} does not belong to the active organization.`);
  }
}

export async function assertCampaignBelongsToOrg(campaignId: string): Promise<void> {
  const organizationId = await orgId();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    select: { id: true },
  });
  if (!campaign) {
    throw new TenantError(`${vocab.campaign.Singular} does not belong to the active organization.`);
  }
}

export async function getCampaignForListWorkflow(campaignId: string): Promise<{
  id: string;
  name: string;
  productId: string;
  icpId: string;
  personaId: string | null;
} | null> {
  const actor = await getWorkActor();
  return prisma.campaign.findFirst({
    where: {
      id: campaignId,
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
    },
    select: {
      id: true,
      name: true,
      productId: true,
      icpId: true,
      personaId: true,
    },
  });
}

// --- Scoring ---

export type ScoringRunWithRelations = ScoringRun & {
  contactList: {
    id: string;
    name: string;
    ownerUserId: string;
    owner: { id: string; name: string | null; email: string };
  };
  product: { id: string; name: string };
  icp: { id: string; name: string };
  persona: { id: string; name: string } | null;
};

export async function listScoringRunsForList(
  contactListId: string,
): Promise<ScoringRunWithRelations[]> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;
  const list = await prisma.contactList.findFirst({
    where: {
      id: contactListId,
      organizationId,
      ...(actor.canViewAll ? {} : { ownerUserId: actor.userId }),
    },
    select: { id: true },
  });
  if (!list) notFound("Contact list");

  return prisma.scoringRun.findMany({
    where: { organizationId, contactListId },
    include: {
      contactList: {
        select: {
          id: true,
          name: true,
          ownerUserId: true,
          owner: { select: { id: true, name: true, email: true } },
        },
      },
      product: { select: { id: true, name: true } },
      icp: { select: { id: true, name: true } },
      persona: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getScoringRun(runId: string): Promise<ScoringRunWithRelations> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;
  const run = await prisma.scoringRun.findFirst({
    where: {
      id: runId,
      organizationId,
      ...(actor.canViewAll
        ? {}
        : { contactList: { ownerUserId: actor.userId } }),
    },
    include: {
      contactList: {
        select: {
          id: true,
          name: true,
          ownerUserId: true,
          owner: { select: { id: true, name: true, email: true } },
        },
      },
      product: { select: { id: true, name: true } },
      icp: { select: { id: true, name: true } },
      persona: { select: { id: true, name: true } },
    },
  });
  if (!run) notFound("Scoring run");
  return run;
}

export async function createScoringRun(input: {
  contactListId: string;
  productId: string;
  icpId: string;
  personaId: string | null;
  /** When set, stamps label + sourceCampaignId for campaign round-trip UX. */
  campaignId?: string | null;
}): Promise<ScoringRun> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;

  const [list, product, icp, sourceCampaign] = await Promise.all([
    prisma.contactList.findFirst({
      where: { id: input.contactListId, organizationId },
    }),
    prisma.product.findFirst({
      where: { id: input.productId, organizationId },
    }),
    prisma.icp.findFirst({
      where: { id: input.icpId, organizationId },
    }),
    input.campaignId
      ? prisma.campaign.findFirst({
          where: { id: input.campaignId, organizationId },
          select: { id: true, name: true, ownerUserId: true },
        })
      : Promise.resolve(null),
  ]);

  if (!list) {
    throw new TenantError(`${vocab.contact.Singular} ${vocab.list.singular} does not belong to the active organization.`);
  }
  assertCanModifyOwnedWork(actor, list.ownerUserId, "Contact list");
  if (sourceCampaign) {
    assertCanModifyOwnedWork(actor, sourceCampaign.ownerUserId, "Campaign");
    if (sourceCampaign.ownerUserId !== list.ownerUserId) {
      throw new TenantError(
        `A scoring run and its ${vocab.campaign.singular} must belong to the same user.`,
      );
    }
  }
  if (list.archivedAt) {
    throw new TenantError(
      `This ${vocab.list.singular} is archived and is read-only. Unarchive it before scoring.`,
    );
  }
  if (!product) {
    throw new TenantError(`${vocab.product.Singular} does not belong to the active organization.`);
  }
  if (!icp) {
    throw new TenantError(`${vocab.icp.singular} does not belong to the active organization.`);
  }
  if (icp.productId !== product.id) {
    throw new TenantError(`${vocab.icp.singular} does not belong to the selected ${vocab.product.singular}.`);
  }

  const personaRows = input.personaId
    ? await prisma.persona.findMany({
        where: { id: input.personaId, organizationId, archivedAt: null },
      })
    : await prisma.persona.findMany({
        where: { organizationId, productId: product.id, archivedAt: null },
        orderBy: { createdAt: "asc" },
      });

  if (personaRows.length === 0) {
    throw new TenantError(
      input.personaId
        ? "Persona does not belong to the active organization."
        : "This product has no personas to score against.",
    );
  }
  if (personaRows.some((persona) => persona.productId !== product.id)) {
    throw new TenantError(`${vocab.persona.Singular} does not belong to the selected ${vocab.product.singular}.`);
  }

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId,
        ownerUserId: list.ownerUserId,
      archivedAt: null,
      memberships: { some: { contactListId: list.id } },
    },
    select: { id: true, email: true, normalizedEmail: true },
    orderBy: { createdAt: "asc" },
  });

  if (contacts.length === 0) {
    throw new TenantError(`This ${vocab.list.singular} has no ${vocab.contact.plural} to score.`);
  }

  // Best-effort company association before creating the run (tenant-scoped).
  // Establish ALS so company-research-service does not need NEXT_RUNTIME.
  const { associateContactsForList } = await import("@/lib/tenant/companies");
  const { runWithTenantContext } = await import("@/lib/tenant/request-context");
  await runWithTenantContext({ organizationId }, () =>
    associateContactsForList(list.id),
  );

  const {
    ensureIcpLegacyCriteriaBackfilled,
    ensurePersonaLegacyCriteriaBackfilled,
  } = await import("@/lib/criteria/legacy-backfill");
  const { repairUnlockedIcpEvidenceClasses } = await import(
    "@/lib/interpretation/icp"
  );
  const { snapshotCriterionRow } = await import("@/lib/scoring/snapshots");

  await Promise.all([
    ensureIcpLegacyCriteriaBackfilled(organizationId, icp.id),
    ...personaRows.map((persona) =>
      ensurePersonaLegacyCriteriaBackfilled(organizationId, persona.id),
    ),
  ]);
  await repairUnlockedIcpEvidenceClasses(organizationId, icp.id);

  const icpCriteriaRows = await prisma.icpCriterion.findMany({
    where: { organizationId, icpId: icp.id },
    orderBy: { sortOrder: "asc" },
  });
  const personaCriteriaById = new Map<
    string,
    ReturnType<typeof snapshotCriterionRow>[]
  >();
  await Promise.all(
    personaRows.map(async (persona) => {
      const rows = await prisma.personaCriterion.findMany({
        where: { organizationId, personaId: persona.id },
        orderBy: { sortOrder: "asc" },
      });
      personaCriteriaById.set(persona.id, rows.map(snapshotCriterionRow));
    }),
  );

  const icpCriteria = icpCriteriaRows.map(snapshotCriterionRow);
  const personaSnapshots = personaRows.map((persona) =>
    snapshotPersona(persona, personaCriteriaById.get(persona.id) ?? []),
  );
  const primaryPersona = personaRows[0]!;
  const primarySnapshot = personaSnapshots[0]!;

  const { scoringRunLabelForCampaign } = await import(
    "@/lib/lists/campaign-query"
  );
  const runLabel = sourceCampaign
    ? scoringRunLabelForCampaign(sourceCampaign.name, list.name)
    : null;

  return prisma.$transaction(async (tx) => {
    const run = await tx.scoringRun.create({
      data: {
        organizationId,
        contactListId: list.id,
        productId: product.id,
        icpId: icp.id,
        personaId: input.personaId ? primaryPersona.id : null,
        label: runLabel,
        sourceCampaignId: sourceCampaign?.id ?? null,
        status: "PENDING",
        totalContacts: contacts.length,
        scoredContacts: 0,
        productSnapshot: snapshotProduct(product),
        icpSnapshot: snapshotIcp(icp, icpCriteria) as Prisma.InputJsonValue,
        personaSnapshot: primarySnapshot as Prisma.InputJsonValue,
        personaSnapshots: personaSnapshots as Prisma.InputJsonValue,
      },
    });

    // Placeholder score rows only — no fabricated scores.
    // Suppressed contacts stay on the run (so the list does not silently shrink)
    // and are marked SUPPRESSED instead of being scored.
    // Email-less contacts are marked UNUSABLE (cannot email, score, or suppress).
    const { listActiveNormalizedEmails, contactMatchesSuppressionSet } =
      await import("@/lib/suppression/service");
    const suppressed = await listActiveNormalizedEmails(
      organizationId,
      contacts.map((contact) => contact.email),
      tx,
    );
    await tx.contactScore.createMany({
      data: contacts.map((contact) => {
        const usable = Boolean(
          contact.normalizedEmail ?? normalizeContactEmail(contact.email),
        );
        if (!usable) {
          return {
            organizationId,
            contactId: contact.id,
            scoringRunId: run.id,
            scoringStatus: "UNUSABLE" as const,
            researchStatus: "NOT_REQUIRED" as const,
            scoringError:
              "No email address — cannot be emailed, scored, or suppressed.",
          };
        }
        const skipped = contactMatchesSuppressionSet(contact.email, suppressed);
        return {
          organizationId,
          contactId: contact.id,
          scoringRunId: run.id,
          scoringStatus: skipped ? ("SUPPRESSED" as const) : ("PENDING" as const),
          researchStatus: skipped
            ? ("NOT_REQUIRED" as const)
            : ("NOT_STARTED" as const),
          scoringError: skipped
            ? "Organization-level suppression — not scored."
            : null,
        };
      }),
    });

    return run;
  });
}

export type ScoreReportSort =
  | "overallScore"
  | "icpScore"
  | "personaScore"
  | "companyScore"
  | "productRelevanceScore"
  | "company"
  | "name";

export type ScoreReportFilters = {
  scoreLabel?: ScoreLabel | "";
  minOverallScore?: number | null;
  company?: string;
  researchStatus?: ResearchStatus | "";
  sort?: ScoreReportSort;
  sortDir?: "asc" | "desc";
};

export type ScoreReportRow = ContactScore & {
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    title: string | null;
    company: string | null;
    companyId: string | null;
    companyRecord: {
      id: string;
      name: string;
      website: string | null;
      normalizedDomain: string | null;
      research: Array<{
        id: string;
        status: import("@prisma/client").CompanyResearchStatus;
        researchMethod: import("@prisma/client").ResearchMethod;
        researchConfidence: import("@prisma/client").ResearchConfidence | null;
        companySummary: string | null;
        whatTheySell: string | null;
        estimatedAov: string | null;
        aovReasoning: string | null;
        customerTypes: unknown;
        primaryMarkets: unknown;
        businessModel: string | null;
        companySizeContext: string | null;
        relevantTechnologies: unknown;
        buyingSignals: unknown;
        riskSignals: unknown;
        researchSources: unknown;
        researchedAt: Date | null;
      }>;
    } | null;
  };
};

export async function getScoreReportRows(
  runId: string,
  filters: ScoreReportFilters = {},
): Promise<ScoreReportRow[]> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;
  const run = await prisma.scoringRun.findFirst({
    where: {
      id: runId,
      organizationId,
      ...(actor.canViewAll
        ? {}
        : { contactList: { ownerUserId: actor.userId } }),
    },
    select: { id: true },
  });
  if (!run) notFound("Scoring run");

  const sort = filters.sort ?? "name";
  const sortDir = filters.sortDir ?? "asc";

  const rows = await prisma.contactScore.findMany({
    where: {
      organizationId,
      scoringRunId: runId,
      ...(filters.scoreLabel ? { scoreLabel: filters.scoreLabel } : {}),
      ...(filters.researchStatus
        ? { researchStatus: filters.researchStatus }
        : {}),
      ...(filters.minOverallScore != null
        ? { overallScore: { gte: filters.minOverallScore } }
        : {}),
      ...(filters.company?.trim()
        ? {
            contact: {
              company: {
                contains: filters.company.trim(),
                mode: "insensitive",
              },
            },
          }
        : {}),
    },
    include: {
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          title: true,
          company: true,
          companyId: true,
          companyRecord: {
            select: {
              id: true,
              name: true,
              website: true,
              normalizedDomain: true,
              research: {
                orderBy: { updatedAt: "desc" },
                take: 1,
                select: {
                  id: true,
                  status: true,
                  researchMethod: true,
                  researchConfidence: true,
                  companySummary: true,
                  whatTheySell: true,
                  estimatedAov: true,
                  aovReasoning: true,
                  customerTypes: true,
                  primaryMarkets: true,
                  businessModel: true,
                  companySizeContext: true,
                  relevantTechnologies: true,
                  buyingSignals: true,
                  riskSignals: true,
                  researchSources: true,
                  researchedAt: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const sorted = [...rows].sort((a, b) => {
    const dir = sortDir === "desc" ? -1 : 1;
    const scoreCmp = (left: number | null, right: number | null) => {
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      return (left - right) * dir;
    };

    switch (sort) {
      case "overallScore":
        return scoreCmp(a.overallScore, b.overallScore);
      case "icpScore":
        return scoreCmp(a.icpScore, b.icpScore);
      case "personaScore":
        return scoreCmp(a.personaScore, b.personaScore);
      case "companyScore":
        return scoreCmp(a.companyScore, b.companyScore);
      case "productRelevanceScore":
        return scoreCmp(a.productRelevanceScore, b.productRelevanceScore);
      case "company": {
        const left = (a.contact.company ?? "").toLowerCase();
        const right = (b.contact.company ?? "").toLowerCase();
        return left.localeCompare(right) * dir;
      }
      case "name":
      default: {
        const left = `${a.contact.lastName ?? ""} ${a.contact.firstName ?? ""}`
          .trim()
          .toLowerCase();
        const right = `${b.contact.lastName ?? ""} ${b.contact.firstName ?? ""}`
          .trim()
          .toLowerCase();
        return left.localeCompare(right) * dir;
      }
    }
  });

  return sorted;
}

// --- Dashboard metrics ---

export type DashboardMetrics = {
  totalLists: number;
  totalContacts: number;
  contactsScored: number;
  scoringRuns: number;
  activeCampaigns: number;
  draftEmails: number;
  emailsSent: number;
};

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const organizationId = await orgId();

  const [
    totalLists,
    totalContacts,
    contactsScored,
    scoringRuns,
    activeCampaigns,
    draftEmails,
    emailsSent,
  ] = await Promise.all([
    prisma.contactList.count({
      where: { organizationId, archivedAt: null },
    }),
    prisma.contact.count({ where: { organizationId } }),
    prisma.contactScore.count({
      where: {
        organizationId,
        overallScore: { not: null },
      },
    }),
    prisma.scoringRun.count({ where: { organizationId } }),
    prisma.campaign.count({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
    }),
    prisma.emailDraft.count({
      where: { organizationId, status: "DRAFT" },
    }),
    prisma.emailDraft.count({
      where: { organizationId, status: "SENT" },
    }),
  ]);

  return {
    totalLists,
    totalContacts,
    contactsScored,
    scoringRuns,
    activeCampaigns,
    draftEmails,
    emailsSent,
  };
}

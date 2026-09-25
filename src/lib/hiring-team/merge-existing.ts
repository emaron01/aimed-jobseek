import type { Persona, Prisma } from "@prisma/client";
import {
  rolesDescribeSamePerson,
  titlesCoherentToRole,
} from "@/lib/hiring-team/identify";
import { prisma } from "@/lib/prisma-client";
import { parseStringArray } from "@/lib/research";

function seekerEdited(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function personaBuilt(persona: Persona): boolean {
  if (
    persona.setupStatus === "NEEDS_REVIEW" ||
    persona.setupStatus === "APPROVED"
  ) {
    return true;
  }
  if (!persona.profileJson || typeof persona.profileJson !== "object") return false;
  const narrative = (persona.profileJson as { narrative?: unknown }).narrative;
  return Boolean(narrative && typeof narrative === "object");
}

function asRole(row: Persona) {
  return {
    roleKey: row.suggestionKey?.trim() || row.id,
    name: row.name,
    likelyTitles: parseStringArray(row.targetTitles),
    whyInvolved: row.whyThisPersonaMatters ?? "",
  };
}

function attachmentScore(input: {
  contacts: number;
  assets: number;
  inPlay: boolean;
}): number {
  return input.contacts * 10 + input.assets * 5 + (input.inPlay ? 3 : 0);
}

function compareSurvivors(
  left: Persona,
  right: Persona,
  score: (persona: Persona) => number,
): number {
  const built = Number(personaBuilt(right)) - Number(personaBuilt(left));
  if (built !== 0) return built;
  const edited =
    Number(seekerEdited(right.manuallyEditedFields)) -
    Number(seekerEdited(left.manuallyEditedFields));
  if (edited !== 0) return edited;
  const attachments = score(right) - score(left);
  if (attachments !== 0) return attachments;
  if (right.name.trim().length !== left.name.trim().length) {
    return right.name.trim().length - left.name.trim().length;
  }
  return left.createdAt.getTime() - right.createdAt.getTime();
}

async function reassignAttachments(input: {
  organizationId: string;
  campaignId: string;
  survivorId: string;
  duplicateId: string;
}): Promise<void> {
  await prisma.campaignContact.updateMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      chosenPersonaId: input.duplicateId,
    },
    data: { chosenPersonaId: input.survivorId },
  });
  await prisma.applicationAsset.updateMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      personaId: input.duplicateId,
    },
    data: { personaId: input.survivorId },
  });
  await prisma.emailDraft.updateMany({
    where: {
      organizationId: input.organizationId,
      personaId: input.duplicateId,
      campaignContact: { campaignId: input.campaignId },
    },
    data: { personaId: input.survivorId },
  });
  await prisma.campaign.updateMany({
    where: {
      id: input.campaignId,
      organizationId: input.organizationId,
      personaId: input.duplicateId,
    },
    data: { personaId: input.survivorId },
  });
  const existingInPlay = await prisma.campaignPersona.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      personaId: input.survivorId,
    },
    select: { id: true },
  });
  if (existingInPlay) {
    await prisma.campaignPersona.deleteMany({
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        personaId: input.duplicateId,
      },
    });
  } else {
    await prisma.campaignPersona.updateMany({
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        personaId: input.duplicateId,
      },
      data: { personaId: input.survivorId },
    });
  }
}

function mergedTitles(survivor: Persona, duplicate: Persona): string[] {
  const titles = [
    ...parseStringArray(survivor.targetTitles),
    ...parseStringArray(duplicate.targetTitles),
  ];
  const unique: string[] = [];
  for (const title of titles) {
    if (!unique.some((item) => item.toLowerCase() === title.toLowerCase())) {
      unique.push(title);
    }
  }
  return titlesCoherentToRole(survivor.name, unique);
}

export async function mergeExistingHiringTeamRoles(input: {
  organizationId: string;
  campaignId: string;
}): Promise<{ merged: number }> {
  const rows = await prisma.persona.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
    },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length < 2) return { merged: 0 };
  const [contacts, assets, inPlay] = await Promise.all([
    prisma.campaignContact.groupBy({
      by: ["chosenPersonaId"],
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        chosenPersonaId: { in: rows.map((row) => row.id) },
      },
      _count: { _all: true },
    }),
    prisma.applicationAsset.groupBy({
      by: ["personaId"],
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        personaId: { in: rows.map((row) => row.id) },
      },
      _count: { _all: true },
    }),
    prisma.campaignPersona.findMany({
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        personaId: { in: rows.map((row) => row.id) },
      },
      select: { personaId: true },
    }),
  ]);
  const contactCount = new Map(
    contacts.flatMap((row) =>
      row.chosenPersonaId ? [[row.chosenPersonaId, row._count._all]] : [],
    ),
  );
  const assetCount = new Map(
    assets.flatMap((row) =>
      row.personaId ? [[row.personaId, row._count._all]] : [],
    ),
  );
  const inPlayIds = new Set(inPlay.map((row) => row.personaId));
  const used = new Set<string>();
  let merged = 0;
  for (const row of rows) {
    if (used.has(row.id)) continue;
    const cluster = [row];
    for (const other of rows) {
      if (other.id === row.id || used.has(other.id)) continue;
      if (rolesDescribeSamePerson(asRole(row), asRole(other))) {
        cluster.push(other);
      }
    }
    if (cluster.length === 1) continue;
    cluster.sort((left, right) =>
      compareSurvivors(left, right, (persona) =>
        attachmentScore({
          contacts: contactCount.get(persona.id) ?? 0,
          assets: assetCount.get(persona.id) ?? 0,
          inPlay: inPlayIds.has(persona.id),
        }),
      ),
    );
    const survivor = cluster[0]!;
    used.add(survivor.id);
    let titles = parseStringArray(survivor.targetTitles);
    let why = survivor.whyThisPersonaMatters ?? "";
    let name = survivor.name;
    const edited = seekerEdited(survivor.manuallyEditedFields);
    for (const duplicate of cluster.slice(1)) {
      used.add(duplicate.id);
      await reassignAttachments({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        survivorId: survivor.id,
        duplicateId: duplicate.id,
      });
      if (!edited) {
        titles = mergedTitles(
          { ...survivor, name, targetTitles: titles },
          duplicate,
        );
        if (duplicate.name.trim().length > name.trim().length) {
          name = duplicate.name;
        }
        const extraWhy = duplicate.whyThisPersonaMatters?.trim() ?? "";
        if (extraWhy.length > why.trim().length) why = extraWhy;
      }
      await prisma.persona.update({
        where: { id: duplicate.id },
        data: { archivedAt: new Date() },
      });
      merged += 1;
      console.info(
        JSON.stringify({
          event: "hiring_team_existing_role_merged",
          campaignId: input.campaignId,
          survivorId: survivor.id,
          survivorName: name,
          duplicateId: duplicate.id,
          duplicateName: duplicate.name,
        }),
      );
    }
    if (!edited) {
      await prisma.persona.update({
        where: { id: survivor.id },
        data: {
          name,
          targetTitles: titles as Prisma.InputJsonValue,
          whyThisPersonaMatters: why || survivor.whyThisPersonaMatters,
          suggestionKey: survivor.suggestionKey ?? cluster[1]?.suggestionKey,
        },
      });
    }
  }
  return { merged };
}

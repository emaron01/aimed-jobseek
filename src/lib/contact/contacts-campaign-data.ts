import "server-only";

import type { Prisma, QualificationBucket } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { scoringRunPersonaWhere } from "@/lib/campaign/personas";
import { applicationPersonaWhere } from "@/lib/hiring-team/scope";
import {
  formatContactCampaignLine,
  resolveContactCampaignQualification,
} from "@/lib/contact/campaign-summary";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";

export type ContactCampaignSummaryLine = {
  campaignId: string;
  campaignName: string;
  line: string;
  sentCount: number;
};

export async function loadContactCampaignSummaries(
  contactIds: string[],
): Promise<Map<string, ContactCampaignSummaryLine[]>> {
  const summaries = new Map<string, ContactCampaignSummaryLine[]>();
  if (contactIds.length === 0) {
    return summaries;
  }

  const organizationId = await requireOrganizationId();
  const campaignContacts = await prisma.campaignContact.findMany({
    where: {
      organizationId,
      contactId: { in: contactIds },
      campaign: { archivedAt: null },
    },
    select: {
      contactId: true,
      campaign: {
        select: {
          id: true,
          name: true,
          productId: true,
          icpId: true,
          personaId: true,
          ownerUserId: true,
        },
      },
      emailDrafts: {
        where: { status: "SENT" },
        select: { id: true, status: true },
      },
    },
    orderBy: [{ campaign: { name: "asc" } }, { createdAt: "asc" }],
  });

  if (campaignContacts.length === 0) {
    return summaries;
  }

  const contactsByCampaign = new Map<
    string,
    {
      campaign: (typeof campaignContacts)[number]["campaign"];
      rows: Array<{
        contactId: string;
        sentCount: number;
      }>;
    }
  >();

  for (const row of campaignContacts) {
    const entry = contactsByCampaign.get(row.campaign.id) ?? {
      campaign: row.campaign,
      rows: [],
    };
    entry.rows.push({
      contactId: row.contactId,
      sentCount: row.emailDrafts.length,
    });
    contactsByCampaign.set(row.campaign.id, entry);
  }

  const qualificationByCampaignContact = new Map<
    string,
    { bucket: QualificationBucket; statusDetail: string | null }
  >();

  await Promise.all(
    [...contactsByCampaign.values()].map(async ({ campaign, rows }) => {
      const qualifications = await qualifyContactsForCampaign(
        organizationId,
        campaign,
        rows.map((row) => row.contactId),
      );
      for (const [contactId, qualification] of qualifications) {
        qualificationByCampaignContact.set(
          `${campaign.id}:${contactId}`,
          qualification,
        );
      }
    }),
  );

  for (const { campaign, rows } of contactsByCampaign.values()) {
    for (const row of rows) {
      const qualification = qualificationByCampaignContact.get(
        `${campaign.id}:${row.contactId}`,
      );
      const line = formatContactCampaignLine({
        campaignName: campaign.name,
        bucket: qualification?.bucket ?? null,
        statusDetail: qualification?.statusDetail ?? null,
        sentCount: row.sentCount,
      });
      const existing = summaries.get(row.contactId) ?? [];
      existing.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        line,
        sentCount: row.sentCount,
      });
      summaries.set(row.contactId, existing);
    }
  }

  return summaries;
}

async function qualifyContactsForCampaign(
  organizationId: string,
  campaign: {
    id: string;
    productId: string;
    icpId: string;
    personaId: string | null;
    ownerUserId: string;
  },
  contactIds: string[],
): Promise<
  Map<string, { bucket: QualificationBucket; statusDetail: string | null }>
> {
  const result = new Map<
    string,
    { bucket: QualificationBucket; statusDetail: string | null }
  >();
  if (contactIds.length === 0) {
    return result;
  }

  const compatibleRuns = await prisma.scoringRun.findMany({
    where: await compatibleScoringRunWhere(campaign, organizationId),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      scores: {
        where: {
          contactId: { in: contactIds },
          scoringStatus: { in: ["COMPLETED", "SUPPRESSED"] },
        },
        select: {
          contactId: true,
          scoringStatus: true,
          scoreLabel: true,
          assessmentData: true,
          criterionAssessments: true,
          matchedPersona: { select: { name: true } },
        },
      },
      qualificationOverrides: {
        where: {
          targetType: "CONTACT",
          targetId: { in: contactIds },
        },
        select: {
          targetId: true,
          bucket: true,
        },
      },
    },
  });

  const runsWithScores = compatibleRuns.filter((run) => run.scores.length > 0);
  if (runsWithScores.length === 0) {
    return result;
  }

  // Most recent compatible run per contact (runs ordered createdAt desc).
  type Selected = {
    run: (typeof runsWithScores)[number];
    score: (typeof runsWithScores)[number]["scores"][number];
  };
  const selectedByContactId = new Map<string, Selected>();
  for (const run of runsWithScores) {
    for (const score of run.scores) {
      if (!selectedByContactId.has(score.contactId)) {
        selectedByContactId.set(score.contactId, { run, score });
      }
    }
  }

  for (const { run, score } of selectedByContactId.values()) {
    const overrideBucket =
      run.qualificationOverrides.find((row) => row.targetId === score.contactId)
        ?.bucket ?? null;
    const qualification = resolveContactCampaignQualification({
      scoringStatus: score.scoringStatus,
      scoreLabel: score.scoreLabel,
      assessmentData: score.assessmentData,
      criterionAssessments: score.criterionAssessments,
      matchedPersonaName: score.matchedPersona?.name ?? null,
      overrideBucket,
    });
    result.set(score.contactId, qualification);
  }

  return result;
}

async function compatibleScoringRunWhere(
  campaign: {
    id: string;
    productId: string;
    icpId: string;
    personaId: string | null;
    ownerUserId: string;
  },
  organizationId: string,
): Promise<Prisma.ScoringRunWhereInput> {
  const [inPlay, productPersonas] = await Promise.all([
    prisma.campaignPersona.findMany({
      where: { organizationId, campaignId: campaign.id },
      select: { personaId: true },
    }),
    prisma.persona.findMany({
      where: {
        organizationId,
        ...applicationPersonaWhere(campaign.id),
      },
      select: { id: true },
    }),
  ]);

  return {
    organizationId,
    productId: campaign.productId,
    icpId: campaign.icpId,
    status: { in: ["COMPLETED", "PARTIAL"] },
    contactList: {
      archivedAt: null,
      ownerUserId: campaign.ownerUserId,
    },
    OR: scoringRunPersonaWhere({
      campaignFallbackPersonaId: campaign.personaId,
      campaignInPlayPersonaIds: inPlay.map((row) => row.personaId),
      productPersonaIds: productPersonas.map((persona) => persona.id),
    }),
  };
}

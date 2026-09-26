import {
  workspaceConsultationHref,
  workspaceProfileHref,
} from "@/lib/application/workspace-links";
import { loadApplicationStepFacts } from "@/lib/application/tracker";
import { prisma } from "@/lib/prisma-client";
import {
  applicationStepFromPathname,
  applicationStepHref,
  type ApplicationStepKey,
} from "@/lib/product-config/application-steps";
import {
  harperActionLabel,
  harperActionTypesForStep,
  type HarperActionType,
} from "@/lib/product-config/harper-actions";
import type { ApplicationStepFactInput } from "@/lib/application/step-progress";

export type HarperSuggestion = {
  type: HarperActionType;
  label: string;
  href: string;
};

export function buildHarperSuggestions(input: {
  campaignId: string;
  step: ApplicationStepKey | "overview";
  facts: ApplicationStepFactInput;
  people: Array<{ name: string }>;
  nextStageId?: string | null;
  productId?: string | null;
}): HarperSuggestion[] {
  const types = harperActionTypesForStep(input.step);
  const suggestions: HarperSuggestion[] = [];
  for (const type of types) {
    const suggestion = suggestionForType(type, input);
    if (suggestion) suggestions.push(suggestion);
  }
  return suggestions;
}

function suggestionForType(
  type: HarperActionType,
  input: {
    campaignId: string;
    facts: ApplicationStepFactInput;
    people: Array<{ name: string }>;
    nextStageId?: string | null;
    productId?: string | null;
  },
): HarperSuggestion | null {
  const href = (key: ApplicationStepKey) =>
    applicationStepHref(input.campaignId, key);
  switch (type) {
    case "start_consultation":
      return {
        type,
        label: harperActionLabel(type),
        href: workspaceConsultationHref(input.campaignId),
      };
    case "review_company":
      return { type, label: harperActionLabel(type), href: href("company") };
    case "review_job":
    case "review_fit":
      return { type, label: harperActionLabel(type), href: href("job") };
    case "review_hiring_team":
      return { type, label: harperActionLabel(type), href: href("hiring-team") };
    case "prepare_person": {
      const person = input.people[0];
      if (!person) return null;
      return {
        type,
        label: harperActionLabel(type, { name: person.name }),
        href: href("hiring-team"),
      };
    }
    case "review_resume":
      if (!input.facts.hasApprovedResume) return null;
      return { type, label: harperActionLabel(type), href: href("assets") };
    case "review_cover_letter":
      if (!input.facts.hasApprovedCoverLetter) return null;
      return { type, label: harperActionLabel(type), href: href("assets") };
    case "write_outreach":
    case "add_contact":
      return { type, label: harperActionLabel(type), href: href("outreach") };
    case "prep_next_stage":
      return {
        type,
        label: harperActionLabel(type),
        href: input.nextStageId
          ? `/campaigns/${input.campaignId}/interviews/${input.nextStageId}`
          : href("interviews"),
      };
    case "generate_cheat_sheet":
      return { type, label: harperActionLabel(type), href: href("summary") };
    case "mark_applied":
      if (input.facts.appliedAt) return null;
      return { type, label: harperActionLabel(type), href: href("applied") };
    case "open_profile": {
      const productId = input.productId?.trim();
      if (!productId) return null;
      return {
        type,
        label: harperActionLabel(type),
        href: workspaceProfileHref(productId),
      };
    }
    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown Harper action: ${String(exhaustive)}`);
    }
  }
}

export async function loadHarperSuggestions(input: {
  organizationId: string;
  campaignId: string;
  pathname: string;
}): Promise<{
  step: ApplicationStepKey | "overview";
  suggestions: HarperSuggestion[];
} | null> {
  const step = applicationStepFromPathname(input.pathname);
  if (!step) return null;
  const current = step === "overview" ? "overview" : step;
  const facts = await loadApplicationStepFacts(input);
  if (!facts) return null;
  const [people, nextStage, campaign] = await Promise.all([
    prisma.campaignContact.findMany({
      where: {
        campaignId: input.campaignId,
        organizationId: input.organizationId,
      },
      select: {
        contact: { select: { firstName: true, lastName: true } },
        chosenPersona: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 8,
    }),
    prisma.interviewStage.findFirst({
      where: {
        campaignId: input.campaignId,
        organizationId: input.organizationId,
        outcome: null,
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
    prisma.campaign.findFirst({
      where: {
        id: input.campaignId,
        organizationId: input.organizationId,
      },
      select: { productId: true },
    }),
  ]);
  return {
    step: current,
    suggestions: buildHarperSuggestions({
      campaignId: input.campaignId,
      step: current,
      facts,
      people: people.map((row) => ({
        name:
          [row.contact.firstName, row.contact.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          row.chosenPersona?.name ||
          "",
      })).filter((person) => person.name),
      nextStageId: nextStage?.id ?? null,
      productId: campaign?.productId ?? null,
    }),
  };
}

import { omitCompensationFromUnknown } from "@/lib/product-research/candidate-profile";

/**
 * Target Employer fields safe to send into outreach, document, or interview generation.
 * Compensation amounts and employment-type pay preferences are omitted.
 */
export function icpForGeneration(icp: {
  id: string;
  name: string;
  definition?: string | null;
  description?: string | null;
}): {
  id: string;
  name: string;
  definition: string | null;
  description: string | null;
} {
  return {
    id: icp.id,
    name: icp.name,
    definition: icp.definition ?? null,
    description: icp.description ?? null,
  };
}

export function profileForGeneration(raw: unknown): unknown {
  return omitCompensationFromUnknown(raw);
}

export function personaGenerationSnapshot(input: {
  product: {
    name: string;
    description: string | null;
    valueProposition: string | null;
    websiteUrl: string | null;
    profileJson: unknown;
  };
  icp: {
    id: string;
    name: string;
    definition?: string | null;
    description?: string | null;
  } | null;
}): {
  productSnapshot: {
    name: string;
    description: string | null;
    valueProposition: string | null;
    websiteUrl: string | null;
    profile: unknown;
  };
  icpContext: { name: string; definition: string | null } | null;
} {
  const icp = input.icp ? icpForGeneration(input.icp) : null;
  return {
    productSnapshot: {
      name: input.product.name,
      description: input.product.description,
      valueProposition: input.product.valueProposition,
      websiteUrl: input.product.websiteUrl,
      profile: profileForGeneration(input.product.profileJson),
    },
    icpContext: icp
      ? { name: icp.name, definition: icp.definition }
      : null,
  };
}

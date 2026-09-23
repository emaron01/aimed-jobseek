"use server";

import { revalidatePath } from "next/cache";
import { interpretIcpDefinition, updateIcpCriterionManual } from "@/lib/interpretation/icp";
import {
  interpretPersonaDefinition,
  updatePersonaCriterionManual,
} from "@/lib/interpretation/persona";
import { getCurrentUser } from "@/lib/auth/session";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { TenantError } from "@/lib/tenant/errors";
import { classifyNeedsReviewRole } from "@/lib/persona-research/project-signals";
import {
  parsePersonaFormData,
  toSafePersonaActionError,
  type PersonaActionResult,
} from "@/lib/persona/save";
import type { IcpActionResult } from "@/lib/icp/save";
import {
  criterionMaterialFingerprint,
  normalizeEvidenceClass,
} from "@/lib/criteria/evidence-class";
import { normalizeIcpCriterionTier } from "@/lib/criteria/tier";
import { createPersona, updatePersona } from "@/lib/tenant/data";
import { prisma } from "@/lib/prisma";
import { vocab } from "@/lib/product-config";

export type CriterionActionResult = {
  ok: boolean;
  message: string;
};

function revalidateSetup(productId?: string) {
  revalidatePath("/setup");
  if (productId) revalidatePath(`/setup/${productId}`);
}

export async function interpretIcpAction(
  _prev: IcpActionResult | null,
  formData: FormData,
): Promise<IcpActionResult> {
  const icpId = String(formData.get("icpId") || "").trim();
  const productId = String(formData.get("productId") || "").trim();
  if (!icpId) {
    return { ok: false, message: `${vocab.icp.singular} id is required.` };
  }

  try {
    const organizationId = await requireOrganizationId();
    const user = await getCurrentUser();
    await interpretIcpDefinition({
      organizationId,
      icpId,
      userId: user?.id ?? null,
    });
    revalidateSetup(productId || undefined);
    return { ok: true, message: "Interpretation complete.", icpId };
  } catch (error) {
    console.error(
      "[icp] interpretation failed",
      error instanceof Error ? error.message.slice(0, 300) : "unknown",
    );
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : `AI interpretation could not be completed. ${vocab.icp.singular} data was not changed.`,
      icpId,
    };
  }
}

/**
 * Save authoritative Persona fields first, then interpret.
 * AI failure never rolls back a successful save.
 */
export async function saveAndInterpretPersonaAction(
  _prev: PersonaActionResult | null,
  formData: FormData,
): Promise<PersonaActionResult> {
  let personaId = "";
  let productId = "";

  try {
    const parsed = parsePersonaFormData(formData);
    productId = parsed.productId;
    personaId = parsed.id;

    if (personaId) {
      await updatePersona(personaId, parsed.fields);
    } else {
      const created = await createPersona({
        ...parsed.fields,
        productId: parsed.productId,
      });
      personaId = created.id;
    }
  } catch (error) {
    return { ok: false, message: toSafePersonaActionError(error) };
  }

  try {
    const organizationId = await requireOrganizationId();
    const user = await getCurrentUser();
    await interpretPersonaDefinition({
      organizationId,
      personaId,
      userId: user?.id ?? null,
    });
    revalidateSetup(productId || undefined);
    return {
      ok: true,
      message: `${vocab.persona.Singular} saved. Interpretation complete.`,
      personaId,
    };
  } catch (error) {
    revalidateSetup(productId || undefined);
    console.error(
      "[persona] interpretation failed after save",
      error instanceof Error ? error.message.slice(0, 300) : "unknown",
    );
    return {
      ok: true,
      message:
        `${vocab.persona.Singular} saved. AI criteria regeneration could not be completed. You can retry later.`,
      personaId,
    };
  }
}

/** Reinterpret only (persona must already exist). Saves are preferred via saveAndInterpret. */
export async function interpretPersonaAction(
  _prev: PersonaActionResult | null,
  formData: FormData,
): Promise<PersonaActionResult> {
  const organizationId = await requireOrganizationId();
  const user = await getCurrentUser();
  const personaId = String(formData.get("personaId") || "").trim();
  const productId = String(formData.get("productId") || "").trim();
  if (!personaId) {
    return { ok: false, message: `Save the ${vocab.persona.singular} before interpreting.` };
  }

  try {
    await interpretPersonaDefinition({
      organizationId,
      personaId,
      userId: user?.id ?? null,
    });
    revalidateSetup(productId || undefined);
    return { ok: true, message: "Interpretation complete.", personaId };
  } catch (error) {
    console.error(
      "[persona] interpretation failed",
      error instanceof Error ? error.message.slice(0, 300) : "unknown",
    );
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : `AI interpretation could not be completed. ${vocab.persona.Singular} data was not changed.`,
      personaId,
    };
  }
}

export async function updateIcpCriterionAction(
  _prev: CriterionActionResult | null,
  formData: FormData,
): Promise<CriterionActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    const criterionId = String(formData.get("criterionId") || "").trim();
    const icpId = String(formData.get("icpId") || "").trim();
    const productId = String(formData.get("productId") || "").trim();
    if (!criterionId || !icpId) {
      return { ok: false, message: `${vocab.icp.singular} criterion id and icp id are required.` };
    }

    const name = String(formData.get("name") || "").trim();
    await updateIcpCriterionManual({
      organizationId,
      icpId,
      criterionId,
      data: {
        ...(name ? { name } : {}),
        description: String(formData.get("description") || "") || null,
        isRequired: formData.get("isRequired") === "on" || formData.get("isRequired") === "true",
        isDisqualifier:
          formData.get("isDisqualifier") === "on" ||
          formData.get("isDisqualifier") === "true",
      },
    });
    revalidateSetup(productId || undefined);
    return { ok: true, message: "Criterion updated." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : `Unable to update ${vocab.icp.singular} criterion. Please try again.`,
    };
  }
}

export async function updateIcpEvidenceClassAction(
  _prev: CriterionActionResult | null,
  formData: FormData,
): Promise<CriterionActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    const criterionId = String(formData.get("criterionId") || "").trim();
    const icpId = String(formData.get("icpId") || "").trim();
    const productId = String(formData.get("productId") || "").trim();
    const evidenceClass = normalizeEvidenceClass(
      formData.get("evidenceClass"),
    );
    if (!criterionId || !icpId) {
      return { ok: false, message: `${vocab.icp.singular} criterion id and icp id are required.` };
    }

    await updateIcpCriterionManual({
      organizationId,
      icpId,
      criterionId,
      data: {
        evidenceClass,
        evidenceClassLocked: true,
        // Class change is material — require a fresh TARGETED_SEARCH decision.
        targetedSearchDecision: null,
        targetedSearchDecisionFingerprint: null,
        targetedSearchDecidedAt: null,
      },
    });
    revalidateSetup(productId || undefined);
    return { ok: true, message: "Evidence class updated." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : "Unable to update evidence class. Please try again.",
    };
  }
}

export async function decideIcpTargetedSearchAction(
  _prev: CriterionActionResult | null,
  formData: FormData,
): Promise<CriterionActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    const criterionId = String(formData.get("criterionId") || "").trim();
    const icpId = String(formData.get("icpId") || "").trim();
    const productId = String(formData.get("productId") || "").trim();
    const decisionRaw = String(formData.get("decision") || "").trim();
    const decision =
      decisionRaw === "KEEP_ASYMMETRIC" ||
      decisionRaw === "MAKE_SUPPORTING" ||
      decisionRaw === "REMOVE"
        ? decisionRaw
        : null;

    if (!criterionId || !icpId || !decision) {
      return {
        ok: false,
        message: "Choose Keep, Make supporting, or Remove for this criterion.",
      };
    }

    const existing = await prisma.icpCriterion.findFirst({
      where: { id: criterionId, organizationId, icpId },
    });
    if (!existing) {
      return { ok: false, message: `${vocab.icp.singular} criterion not found.` };
    }

    if (decision === "REMOVE") {
      await prisma.icpCriterion.delete({ where: { id: existing.id } });
      revalidateSetup(productId || undefined);
      return { ok: true, message: "Criterion removed." };
    }

    const evidenceClass = normalizeEvidenceClass(existing.evidenceClass);
    const fingerprint = criterionMaterialFingerprint({
      name: existing.name,
      description: existing.description,
      criterionType: existing.criterionType,
      evidenceClass,
      operator: existing.operator,
      targetValue: existing.targetValue,
      minValue: existing.minValue,
      maxValue: existing.maxValue,
      allowedValues: existing.allowedValues,
    });

    await updateIcpCriterionManual({
      organizationId,
      icpId,
      criterionId,
      data: {
        isRequired:
          decision === "MAKE_SUPPORTING" ? false : existing.isRequired,
        targetedSearchDecision: decision,
        targetedSearchDecisionFingerprint: fingerprint,
        targetedSearchDecidedAt: new Date(),
      },
    });
    revalidateSetup(productId || undefined);
    return {
      ok: true,
      message:
        decision === "MAKE_SUPPORTING"
          ? "Criterion set to supporting."
          : "Criterion kept with asymmetric evaluation.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : "Unable to save criterion decision. Please try again.",
    };
  }
}

export async function updateIcpCriterionTierAction(
  _prev: CriterionActionResult | null,
  formData: FormData,
): Promise<CriterionActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    const criterionId = String(formData.get("criterionId") || "").trim();
    const icpId = String(formData.get("icpId") || "").trim();
    const productId = String(formData.get("productId") || "").trim();
    const tier = normalizeIcpCriterionTier(formData.get("tier"));
    const isMandatory =
      formData.get("isMandatory") === "on" ||
      formData.get("isMandatory") === "true";
    if (!criterionId || !icpId) {
      return { ok: false, message: `${vocab.icp.singular} criterion id and icp id are required.` };
    }
    if (!tier) {
      return {
        ok: false,
        message: "Choose whether this defines a fit or is good to know.",
      };
    }

    await updateIcpCriterionManual({
      organizationId,
      icpId,
      criterionId,
      data: { tier, isMandatory },
    });
    revalidateSetup(productId || undefined);
    return { ok: true, message: "Criterion scoring role updated." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : "Unable to update criterion scoring role. Please try again.",
    };
  }
}

export async function updatePersonaCriterionAction(
  _prev: PersonaActionResult | null,
  formData: FormData,
): Promise<PersonaActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    const criterionId = String(formData.get("criterionId") || "").trim();
    const personaId = String(formData.get("personaId") || "").trim();
    const productId = String(formData.get("productId") || "").trim();
    if (!criterionId || !personaId) {
      return {
        ok: false,
        message: `${vocab.persona.Singular} criterion id and ${vocab.persona.singular} id are required.`,
      };
    }

    const role = String(formData.get("role") || "").trim();
    const classified = classifyNeedsReviewRole(role);
    let isRequired = formData.get("isRequired") === "on" || formData.get("isRequired") === "true";
    let isDisqualifier =
      formData.get("isDisqualifier") === "on" ||
      formData.get("isDisqualifier") === "true";
    let criterionType: string | undefined;
    const classifyRoles = new Set([
      "positive",
      "exclusion",
      "ownership",
      "responsibility",
    ]);

    if (classified) {
      isRequired = classified.isRequired;
      isDisqualifier = classified.isDisqualifier;
      criterionType = classified.criterionType;
    }

    const existing = await prisma.personaCriterion.findFirst({
      where: { id: criterionId, organizationId, personaId },
      select: { criterionType: true },
    });
    const promoteFromNeedsReview =
      existing?.criterionType.trim().toLowerCase() === "needs_review" &&
      Boolean(criterionType);
    const applyType =
      promoteFromNeedsReview || classifyRoles.has(role);

    const name = String(formData.get("name") || "").trim();
    await updatePersonaCriterionManual({
      organizationId,
      personaId,
      criterionId,
      data: {
        ...(name ? { name } : {}),
        description: String(formData.get("description") || "") || null,
        isRequired,
        isDisqualifier,
        ...(applyType && criterionType ? { criterionType } : {}),
      },
    });
    revalidateSetup(productId || undefined);
    return { ok: true, message: "Criterion updated.", personaId };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : `Unable to update ${vocab.persona.singular} criterion. Please try again.`,
    };
  }
}

export async function deletePersonaCriterionAction(
  _prev: PersonaActionResult | null,
  formData: FormData,
): Promise<PersonaActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    const criterionId = String(formData.get("criterionId") || "").trim();
    const personaId = String(formData.get("personaId") || "").trim();
    const productId = String(formData.get("productId") || "").trim();
    if (!criterionId || !personaId) {
      return {
        ok: false,
        message: `${vocab.persona.Singular} criterion id and ${vocab.persona.singular} id are required.`,
      };
    }

    const existing = await prisma.personaCriterion.findFirst({
      where: { id: criterionId, organizationId, personaId },
    });
    if (!existing) {
      return {
        ok: false,
        message: `${vocab.persona.Singular} criterion not found in the active organization.`,
      };
    }

    await prisma.personaCriterion.delete({ where: { id: existing.id } });
    revalidateSetup(productId || undefined);
    return { ok: true, message: "Criterion removed.", personaId };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : `Unable to remove ${vocab.persona.singular} criterion. Please try again.`,
    };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/authz";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { TenantError } from "@/lib/tenant/errors";
import {
  researchAndSynthesizePersona,
  resynthesizePersonaFromRun,
} from "@/lib/persona-research/synthesize";
import {
  applyApprovedPersonaResynthesis,
  startApprovedPersonaResynthesis,
} from "@/lib/persona-research/resynthesize-approved";
import { approvePersonaFromSetupRun } from "@/lib/persona-research/approve";
import { projectPersonaSignalsFromProfile } from "@/lib/persona-research/apply-profile-signals";
import { parsePersonaCriteriaFormJson } from "@/lib/persona-research/project-signals";
import type { SuggestedBuyerRole } from "@/lib/product-research/contract";
import { createCorrelationId } from "@/lib/product-research/url";
import { prisma } from "@/lib/prisma";
import { vocab } from "@/lib/product-config";

export type PersonaSetupActionResult = {
  ok: boolean;
  message: string;
  productId?: string;
  personaSetupRunId?: string;
  personaId?: string;
  status?: string;
};

function safeError(error: unknown): string {
  if (error instanceof TenantError) return error.message;
  return `Unable to complete ${vocab.persona.Singular} setup. Please try again.`;
}

function revalidatePersona(productId: string, runId?: string, personaId?: string) {
  revalidatePath("/setup");
  revalidatePath(`/setup/${productId}`);
  revalidatePath(`/setup/${productId}/research`);
  if (runId) revalidatePath(`/setup/${productId}/personas/${runId}`);
  if (personaId) {
    revalidatePath(`/setup/${productId}/personas/manage/${personaId}`);
    if (runId) {
      revalidatePath(
        `/setup/${productId}/personas/manage/${personaId}/rebuild/${runId}`,
      );
    }
  }
}

export async function buildPersonaFromBuyerRoleAction(
  _prev: PersonaSetupActionResult | null,
  formData: FormData,
): Promise<PersonaSetupActionResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const productId = String(formData.get("productId") || "").trim();
    const suggestionKey = String(formData.get("suggestionKey") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const why = String(formData.get("whyThisRoleMatters") || "").trim();
    const titles = String(formData.get("likelyTitles") || "")
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const notes = String(formData.get("notes") || "").trim();

    if (!productId || !name) {
      return { ok: false, message: `${vocab.product.Singular} and ${vocab.buyer.singular} name are required.` };
    }

    const buyerRole: SuggestedBuyerRole = {
      suggestionKey: suggestionKey || `custom-${createCorrelationId().slice(0, 8)}`,
      name,
      likelyTitles: titles,
      departmentFunction:
        String(formData.get("departmentFunction") || "").trim() || null,
      whyThisRoleMatters: why || null,
      confidence: "MEDIUM",
      evidenceRefs: [],
    };

    const result = await researchAndSynthesizePersona({
      organizationId,
      productId,
      userId: user.id,
      buyerRole,
      userContext: notes
        ? { notes, nameOverride: null, likelyTitles: titles }
        : null,
    });

    revalidatePersona(productId, result.personaSetupRunId);
    return {
      ok: result.status !== "FAILED",
      message:
        result.status === "FAILED"
          ? result.errorSafe || `${vocab.persona.Singular} synthesis failed.`
          : `${vocab.persona.Singular} draft ready for review.`,
      productId,
      personaSetupRunId: result.personaSetupRunId,
      status: result.status,
    };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

export async function retryPersonaSynthesisAction(
  _prev: PersonaSetupActionResult | null,
  formData: FormData,
): Promise<PersonaSetupActionResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const productId = String(formData.get("productId") || "").trim();
    const personaSetupRunId = String(
      formData.get("personaSetupRunId") || "",
    ).trim();
    if (!productId || !personaSetupRunId) {
      return { ok: false, message: `${vocab.product.Singular} and ${vocab.persona.singular} setup run are required.` };
    }
    const result = await resynthesizePersonaFromRun({
      organizationId,
      productId,
      userId: user.id,
      personaSetupRunId,
    });
    revalidatePersona(productId, result.personaSetupRunId);
    return {
      ok: result.status !== "FAILED",
      message:
        result.status === "FAILED"
          ? result.errorSafe || "Retry failed."
          : `${vocab.persona.Singular} draft ready for review.`,
      productId,
      personaSetupRunId: result.personaSetupRunId,
      status: result.status,
    };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

export async function saveApprovedPersonaFromRunAction(
  _prev: PersonaSetupActionResult | null,
  formData: FormData,
): Promise<PersonaSetupActionResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const productId = String(formData.get("productId") || "").trim();
    const personaSetupRunId = String(
      formData.get("personaSetupRunId") || "",
    ).trim();
    const name = String(formData.get("name") || "").trim();
    if (!productId || !personaSetupRunId || !name) {
      return {
        ok: false,
        message: `${vocab.product.Singular}, setup run, and name are required.`,
      };
    }

    const criteriaJson = String(formData.get("criteriaJson") || "");
    const parsedCriteria = parsePersonaCriteriaFormJson(criteriaJson);

    const personaId = await approvePersonaFromSetupRun({
      organizationId,
      productId,
      userId: user.id,
      personaSetupRunId,
      fields: {
        name,
        department: String(formData.get("department") || "").trim() || null,
        seniority: String(formData.get("seniority") || "").trim() || null,
        definition: String(formData.get("definition") || "").trim() || null,
        likelyTitles: String(formData.get("likelyTitles") || "")
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        responsibilities: String(formData.get("responsibilities") || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        painPoints: String(formData.get("painPoints") || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        desiredOutcomes: String(formData.get("desiredOutcomes") || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        messagingNotes:
          String(formData.get("messagingNotes") || "").trim() || null,
      },
      editedFields: [
        "name",
        "department",
        "seniority",
        "definition",
        "likelyTitles",
        "responsibilities",
        "painPoints",
        "desiredOutcomes",
        "messagingNotes",
      ],
      criteria: parsedCriteria ?? undefined,
    });

    revalidatePersona(productId, personaSetupRunId);
    return {
      ok: true,
      message: `${vocab.persona.Singular} saved and approved.`,
      productId,
      personaSetupRunId,
      personaId,
      status: "APPROVED",
    };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

/** User-initiated projection of profileJson signals into PersonaCriterion rows. */
export async function projectPersonaSignalsFromProfileAction(
  _prev: PersonaSetupActionResult | null,
  formData: FormData,
): Promise<PersonaSetupActionResult> {
  try {
    await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const productId = String(formData.get("productId") || "").trim();
    const personaId = String(formData.get("personaId") || "").trim();
    if (!productId || !personaId) {
      return { ok: false, message: `${vocab.product.Singular} and ${vocab.persona.singular} are required.` };
    }

    const inserted = await projectPersonaSignalsFromProfile({
      organizationId,
      personaId,
    });

    revalidatePersona(productId);
    return {
      ok: true,
      message:
        inserted > 0
          ? `Projected ${inserted} criterion(s) from stored role signals.`
          : "No new criteria to project — signals may already be represented.",
      productId,
      personaId,
    };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

/** Re-synthesize an approved persona from stored product evidence (same persona id). */
export async function rebuildPersonaFromProductEvidenceAction(
  _prev: PersonaSetupActionResult | null,
  formData: FormData,
): Promise<PersonaSetupActionResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const productId = String(formData.get("productId") || "").trim();
    const personaId = String(formData.get("personaId") || "").trim();
    if (!productId || !personaId) {
      return { ok: false, message: `${vocab.product.Singular} and ${vocab.persona.singular} are required.` };
    }

    const result = await startApprovedPersonaResynthesis({
      organizationId,
      productId,
      userId: user.id,
      personaId,
    });

    revalidatePersona(productId, result.personaSetupRunId, personaId);
    return {
      ok: result.status !== "FAILED",
      message:
        result.status === "FAILED"
          ? result.errorSafe || `${vocab.persona.Singular} rebuild failed.`
          : "Rebuild draft ready for review.",
      productId,
      personaId,
      personaSetupRunId: result.personaSetupRunId,
      status: result.status,
    };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

/** Apply an in-place persona rebuild after user review. */
export async function applyPersonaResynthesisAction(
  _prev: PersonaSetupActionResult | null,
  formData: FormData,
): Promise<PersonaSetupActionResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const productId = String(formData.get("productId") || "").trim();
    const personaId = String(formData.get("personaId") || "").trim();
    const personaSetupRunId = String(
      formData.get("personaSetupRunId") || "",
    ).trim();
    if (!productId || !personaId || !personaSetupRunId) {
      return {
        ok: false,
        message: `${vocab.product.Singular}, ${vocab.persona.singular}, and rebuild draft are required.`,
      };
    }

    const criteriaJson = String(formData.get("criteriaJson") || "");
    const parsedCriteria = parsePersonaCriteriaFormJson(criteriaJson);

    await applyApprovedPersonaResynthesis({
      organizationId,
      productId,
      userId: user.id,
      personaId,
      personaSetupRunId,
      fields: {
        definition: String(formData.get("definition") || "").trim() || null,
        department: String(formData.get("department") || "").trim() || null,
        seniority: String(formData.get("seniority") || "").trim() || null,
        responsibilities: String(formData.get("responsibilities") || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        painPoints: String(formData.get("painPoints") || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        desiredOutcomes: String(formData.get("desiredOutcomes") || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        messagingNotes:
          String(formData.get("messagingNotes") || "").trim() || null,
      },
      criteria: parsedCriteria ?? undefined,
    });

    revalidatePersona(productId, personaSetupRunId, personaId);
    return {
      ok: true,
      message: `${vocab.persona.Singular} updated from rebuild draft.`,
      productId,
      personaId,
      personaSetupRunId,
      status: "APPROVED",
    };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

/** Resolve buyer role from latest approved product setup run. */
export async function getSuggestedBuyerRoleAction(
  productId: string,
  suggestionKey: string,
): Promise<SuggestedBuyerRole | null> {
  const organizationId = await requireOrganizationId();
  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId },
  });
  if (!product?.approvedSetupRunId) return null;
  const run = await prisma.productSetupRun.findFirst({
    where: {
      id: product.approvedSetupRunId,
      organizationId,
      productId,
    },
  });
  const roles = (run?.suggestedPersonasJson as SuggestedBuyerRole[] | null) ?? [];
  return roles.find((r) => r.suggestionKey === suggestionKey) ?? null;
}

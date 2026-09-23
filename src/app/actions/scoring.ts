"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AiConfigError } from "@/lib/ai/errors";
import { getCurrentUser } from "@/lib/org/authz";
import { runScoringForRun } from "@/lib/scoring/engine";
import { ALL_PERSONAS_VALUE } from "@/lib/scoring/title-fit";
import { resolveTitleSuggestion } from "@/lib/scoring/title-suggestions";
import { createScoringRun } from "@/lib/tenant/data";
import {
  assertCanModifyOwnedWork,
  getWorkActor,
} from "@/lib/work/ownership";
import { TenantError } from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";

function requiredString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function toSafeScoringRunActionError(error: unknown): string {
  if (error instanceof TenantError) return error.message;
  return "Unable to create scoring run. Please try again.";
}

export type ScoringRunActionResult = {
  ok: boolean;
  message: string;
};

export async function createScoringRunAction(
  _prev: ScoringRunActionResult | null,
  formData: FormData,
): Promise<ScoringRunActionResult> {
  const contactListId = requiredString(formData, "contactListId");
  const productId = requiredString(formData, "productId");
  const icpId = requiredString(formData, "icpId");
  const personaRaw = requiredString(formData, "personaId");
  const campaignId = requiredString(formData, "campaignId") || null;
  const allPersonas = personaRaw === ALL_PERSONAS_VALUE;

  if (!contactListId || !productId || !icpId || (!allPersonas && !personaRaw)) {
    return { ok: false, message: `${vocab.product.Singular}, ${vocab.icp.singular}, and ${vocab.persona.Singular} are required.` };
  }

  try {
    const { listIcpCriteria } = await import("@/lib/interpretation/icp");
    const {
      criterionMaterialFingerprint,
      isTargetedSearchDecisionStale,
      normalizeEvidenceClass,
    } = await import("@/lib/criteria/evidence-class");
    const actor = await getWorkActor();
    const organizationId = actor.organizationId;
    const criteria = await listIcpCriteria(organizationId, icpId);
    const undecided = criteria.filter((c) => {
      const evidenceClass = normalizeEvidenceClass(c.evidenceClass);
      if (evidenceClass !== "TARGETED_SEARCH") return false;
      const fp = criterionMaterialFingerprint({
        name: c.name,
        description: c.description,
        criterionType: c.criterionType,
        evidenceClass,
        operator: c.operator,
        targetValue: c.targetValue,
        minValue: c.minValue,
        maxValue: c.maxValue,
        allowedValues: c.allowedValues,
      });
      return isTargetedSearchDecisionStale({
        decision: c.targetedSearchDecision,
        storedFingerprint: c.targetedSearchDecisionFingerprint,
        currentFingerprint: fp,
      });
    });
    if (undecided.length > 0) {
      return {
        ok: false,
        message: `Decide how to treat per-company lookup criteria before scoring: ${undecided
          .map((c) => `"${c.name}"`)
          .join(", ")}.`,
      };
    }
  } catch (error) {
    if (error instanceof TenantError) {
      return { ok: false, message: error.message };
    }
    // Fall through to create — org resolution failures surface from createScoringRun.
  }

  let run;
  try {
    run = await createScoringRun({
      contactListId,
      productId,
      icpId,
      personaId: allPersonas ? null : personaRaw,
      campaignId,
    });
  } catch (error) {
    return { ok: false, message: toSafeScoringRunActionError(error) };
  }

  // redirect() throws — keep it outside try/catch so navigation still fires.
  const { scoringRunHref } = await import("@/lib/lists/campaign-query");
  redirect(scoringRunHref(run.id, campaignId ?? run.sourceCampaignId));
}

export async function scoreContactsAction(
  formData: FormData,
): Promise<{
  ok: boolean;
  message: string;
  completed?: number;
  failed?: number;
  status?: string;
}> {
  const scoringRunId = requiredString(formData, "scoringRunId");
  const forceRescore = requiredString(formData, "forceRescore") === "1";

  if (!scoringRunId) {
    return { ok: false, message: "Scoring run is required." };
  }

  try {
    const summary = await runScoringForRun(scoringRunId, { forceRescore });
    revalidatePath(`/scoring/${scoringRunId}`);
    return {
      ok: true,
      message: `Scoring finished: ${summary.completed} completed, ${summary.failed} failed (run status: ${summary.status}).`,
      completed: summary.completed,
      failed: summary.failed,
      status: summary.status,
    };
  } catch (error) {
    if (error instanceof AiConfigError) {
      return { ok: false, message: error.message };
    }
    if (error instanceof TenantError) {
      return { ok: false, message: error.message };
    }
    const message =
      error instanceof Error ? error.message : "Unable to score contacts.";
    return { ok: false, message };
  }
}

export async function resolveTitleSuggestionAction(
  formData: FormData,
): Promise<{
  ok: boolean;
  message: string;
  scored?: number;
  failed?: number;
}> {
  const suggestionId = requiredString(formData, "suggestionId");
  const scoringRunId = requiredString(formData, "scoringRunId");
  const actionRaw = requiredString(formData, "action");
  const personaId = requiredString(formData, "personaId");
  const action =
    actionRaw === "assign"
      ? "assign"
      : actionRaw === "dismiss"
        ? "dismiss"
        : "approve";

  if (!suggestionId || !scoringRunId) {
    return { ok: false, message: "Title suggestion is required." };
  }

  try {
    const actor = await getWorkActor();
    const organizationId = actor.organizationId;
    const user = await getCurrentUser();
    const { prisma } = await import("@/lib/prisma");
    const run = await prisma.scoringRun.findFirst({
      where: { id: scoringRunId, organizationId },
      select: { contactList: { select: { ownerUserId: true } } },
    });
    if (!run) {
      return { ok: false, message: "Scoring run was not found." };
    }
    assertCanModifyOwnedWork(actor, run.contactList.ownerUserId, "Scoring run");
    const result = await resolveTitleSuggestion({
      organizationId,
      userId: user?.id ?? null,
      suggestionId,
      action,
      personaId: personaId || null,
    });
    revalidatePath(`/scoring/${scoringRunId}`);
    return result;
  } catch (error) {
    if (error instanceof AiConfigError) {
      return { ok: false, message: error.message };
    }
    if (error instanceof TenantError) {
      return { ok: false, message: error.message };
    }
    const message =
      error instanceof Error
        ? error.message
        : "Unable to update the title suggestion.";
    return { ok: false, message };
  }
}

export type MandatoryRescoreResult = {
  ok: boolean;
  message: string;
};

export async function makePrimaryCriterionMandatoryAndRescoreAction(
  _prev: MandatoryRescoreResult | null,
  formData: FormData,
): Promise<MandatoryRescoreResult> {
  const scoringRunId = requiredString(formData, "scoringRunId");
  const criterionId = requiredString(formData, "criterionId");
  if (!scoringRunId || !criterionId) {
    return { ok: false, message: "Scoring run and criterion are required." };
  }

  try {
    const actor = await getWorkActor();
    const organizationId = actor.organizationId;
    const { prisma } = await import("@/lib/prisma");
    const { updateIcpCriterionManual } = await import(
      "@/lib/interpretation/icp"
    );
    const { coerceIsMandatory } = await import("@/lib/criteria/tier");

    const run = await prisma.scoringRun.findFirst({
      where: { id: scoringRunId, organizationId },
      include: { contactList: { select: { ownerUserId: true } } },
    });
    if (!run) {
      return { ok: false, message: "Scoring run was not found." };
    }
    assertCanModifyOwnedWork(actor, run.contactList.ownerUserId, "Scoring run");

    const snapshot = run.icpSnapshot as {
      id?: string;
      criteria?: Array<{
        id?: string;
        name?: string;
        tier?: string;
        isMandatory?: boolean;
      }>;
    };
    const snapshotCriterion = (snapshot.criteria ?? []).find(
      (row) => row.id === criterionId,
    );
    if (!snapshotCriterion) {
      return { ok: false, message: "That criterion is not on this scoring run." };
    }

    await updateIcpCriterionManual({
      organizationId,
      icpId: run.icpId,
      criterionId,
      data: { isMandatory: true },
    });

    const nextCriteria = (snapshot.criteria ?? []).map((row) =>
      row.id === criterionId
        ? { ...row, isMandatory: coerceIsMandatory("PRIMARY", true) }
        : row,
    );
    await prisma.scoringRun.update({
      where: { id: run.id },
      data: {
        icpSnapshot: { ...snapshot, criteria: nextCriteria },
      },
    });

    const scores = await prisma.contactScore.findMany({
      where: { organizationId, scoringRunId: run.id },
      select: { id: true, criterionAssessments: true, assessmentData: true },
    });
    const name = snapshotCriterion.name ?? "";
    const toRescore = scores
      .filter((score) => {
        const rows = Array.isArray(score.criterionAssessments)
          ? score.criterionAssessments
          : typeof score.assessmentData === "object" &&
              score.assessmentData &&
              Array.isArray(
                (score.assessmentData as { criterionAssessments?: unknown })
                  .criterionAssessments,
              )
            ? (
                score.assessmentData as {
                  criterionAssessments: unknown[];
                }
              ).criterionAssessments
            : [];
        return rows.some((row) => {
          if (!row || typeof row !== "object") return false;
          const assessment = row as {
            name?: unknown;
            evidenceOutcome?: unknown;
            assessment?: unknown;
            excludeFromScore?: unknown;
          };
          if (String(assessment.name ?? "") !== name) return false;
          if (assessment.excludeFromScore) return false;
          return (
            assessment.evidenceOutcome === "CONTRADICTED" ||
            assessment.assessment === "NO_FIT"
          );
        });
      })
      .map((score) => score.id);

    if (toRescore.length === 0) {
      revalidatePath(`/scoring/${run.id}`);
      return {
        ok: true,
        message: "Mandatory is on. No scored companies needed a rescore.",
      };
    }

    const summary = await runScoringForRun(run.id, {
      forceRescore: true,
      contactScoreIds: toRescore,
    });
    revalidatePath(`/scoring/${run.id}`);
    return {
      ok: true,
      message: `Mandatory is on. Rescored ${summary.completed} ${summary.completed === 1 ? "company" : "companies"}.`,
    };
  } catch (error) {
    if (error instanceof AiConfigError) {
      return { ok: false, message: error.message };
    }
    if (error instanceof TenantError) {
      return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to make this criterion mandatory.",
    };
  }
}

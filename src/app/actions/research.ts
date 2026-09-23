"use server";

import { revalidatePath } from "next/cache";
import {
  getCompaniesNeedingResearchForContactList,
  getCompaniesNeedingResearchForScoringRun,
  researchCompany,
  updateManualCompanyResearch,
} from "@/lib/tenant/companies";
import {
  requireOrganizationId,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  formatResearchAllowanceExhausted,
  RESEARCH_BILLING_HREF,
} from "@/lib/usage/research-allowance";
import {
  canRetryResearchRun,
  createResearchRun,
  getActiveResearchRunForContactList,
  getResearchRunForOrganization,
  requireResearchRunInOrganization,
} from "@/lib/research/runs";
import type { ResearchRunView } from "@/lib/research/run-types";
import {
  assertCanModifyOwnedWork,
  assertCanViewOwnedWork,
  getWorkActor,
} from "@/lib/work/ownership";
import { vocab } from "@/lib/product-config";

function requiredString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function parseLineList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export type ResearchStartResult = {
  ok: boolean;
  message: string;
  runId?: string;
  code?: "ACTIVE_RUN" | "NOTHING_TO_DO" | "INVALID_RETRY";
  activeRunId?: string;
  run?: ResearchRunView;
};

async function startResearchRun(input: {
  contactListId: string;
  forceRefresh: boolean;
  scoringRunId?: string;
  revalidatePathname: string;
}): Promise<ResearchStartResult> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;
  const user = await requireCurrentUser();
  const { prisma } = await import("@/lib/prisma");
  const list = await prisma.contactList.findFirst({
    where: { id: input.contactListId, organizationId },
    select: { ownerUserId: true },
  });
  if (!list) throw new TenantError(`${vocab.contact.Singular} ${vocab.list.singular} was not found.`);
  assertCanModifyOwnedWork(actor, list.ownerUserId, "Contact list");

  const result = await createResearchRun({
    organizationId,
    contactListId: input.contactListId,
    initiatedByUserId: user.id,
    forceRefresh: input.forceRefresh,
    scoringRunId: input.scoringRunId,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      code: result.code,
      activeRunId: "activeRunId" in result ? result.activeRunId : undefined,
    };
  }

  revalidatePath(input.revalidatePathname);
  return {
    ok: true,
    message: input.forceRefresh
      ? `Refreshing research for ${result.run.totalCompanies} companies in the background.`
      : `Research started for ${result.run.totalCompanies} companies in the background.`,
    runId: result.run.id,
    run: result.run,
  };
}

export async function researchCompaniesForContactListAction(
  formData: FormData,
): Promise<ResearchStartResult> {
  const contactListId = requiredString(formData, "contactListId");
  const forceRefresh = requiredString(formData, "forceRefresh") === "1";

  if (!contactListId) {
    return { ok: false, message: `${vocab.contact.Singular} ${vocab.list.singular} is required.` };
  }

  try {
    const actor = await getWorkActor();
    const { prisma } = await import("@/lib/prisma");
    const list = await prisma.contactList.findFirst({
      where: { id: contactListId, organizationId: actor.organizationId },
      select: { ownerUserId: true },
    });
    if (!list) throw new TenantError(`${vocab.contact.Singular} ${vocab.list.singular} was not found.`);
    assertCanModifyOwnedWork(actor, list.ownerUserId, "Contact list");
    if (!forceRefresh) {
      const plan = await getCompaniesNeedingResearchForContactList(contactListId);
      if (plan.needingResearch === 0) {
        return {
          ok: true,
          message: `All ${plan.uniqueCompanies} unique companies already have fresh research.`,
          code: "NOTHING_TO_DO",
        };
      }
    }

    return await startResearchRun({
      contactListId,
      forceRefresh,
      revalidatePathname: `/lists/${contactListId}`,
    });
  } catch (error) {
    const message =
      error instanceof TenantError
        ? error.message
        : "Unable to start company research.";
    return { ok: false, message };
  }
}

export async function researchCompaniesForScoringRunAction(
  formData: FormData,
): Promise<ResearchStartResult> {
  const scoringRunId = requiredString(formData, "scoringRunId");
  const forceRefresh = requiredString(formData, "forceRefresh") === "1";

  if (!scoringRunId) {
    return { ok: false, message: "Scoring run is required." };
  }

  try {
    const organizationId = await requireOrganizationId();
    const { prisma } = await import("@/lib/prisma");
    const run = await prisma.scoringRun.findFirst({
      where: { id: scoringRunId, organizationId },
      select: {
        contactListId: true,
        contactList: { select: { ownerUserId: true } },
      },
    });
    if (!run) {
      return { ok: false, message: "Scoring run not found." };
    }
    const actor = await getWorkActor();
    assertCanModifyOwnedWork(actor, run.contactList.ownerUserId, "Scoring run");

    if (!forceRefresh) {
      const plan = await getCompaniesNeedingResearchForScoringRun(scoringRunId);
      if (plan.needingResearch === 0) {
        return {
          ok: true,
          message: `All ${plan.uniqueCompanies} unique companies already have fresh research.`,
          code: "NOTHING_TO_DO",
        };
      }
    }

    return await startResearchRun({
      contactListId: run.contactListId,
      forceRefresh,
      scoringRunId,
      revalidatePathname: `/scoring/${scoringRunId}`,
    });
  } catch (error) {
    const message =
      error instanceof TenantError
        ? error.message
        : "Unable to start company research.";
    return { ok: false, message };
  }
}

export async function getResearchRunStatusAction(
  runId: string,
): Promise<ResearchRunView | null> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;
  const { prisma } = await import("@/lib/prisma");
  const run = await prisma.researchRun.findFirst({
    where: { id: runId, organizationId },
    select: { contactList: { select: { ownerUserId: true } } },
  });
  if (!run) return null;
  assertCanViewOwnedWork(actor, run.contactList.ownerUserId, "Research run");
  return getResearchRunForOrganization(runId, organizationId);
}

export async function getActiveResearchRunForListAction(
  contactListId: string,
): Promise<ResearchRunView | null> {
  const actor = await getWorkActor();
  const organizationId = actor.organizationId;
  const { prisma } = await import("@/lib/prisma");
  const list = await prisma.contactList.findFirst({
    where: { id: contactListId, organizationId },
    select: { ownerUserId: true },
  });
  if (!list) return null;
  assertCanViewOwnedWork(actor, list.ownerUserId, "Contact list");
  return getActiveResearchRunForContactList(contactListId, organizationId);
}

export async function retryFailedResearchRunAction(
  runId: string,
): Promise<ResearchStartResult> {
  try {
    const organizationId = await requireOrganizationId();
    const user = await requireCurrentUser();
    const prior = await requireResearchRunInOrganization(runId, organizationId);
    const { prisma } = await import("@/lib/prisma");
    const list = await prisma.contactList.findFirstOrThrow({
      where: { id: prior.contactListId, organizationId },
      select: { ownerUserId: true },
    });
    assertCanModifyOwnedWork(
      { userId: user.id },
      list.ownerUserId,
      "Research run",
    );

    if (!canRetryResearchRun(prior)) {
      return {
        ok: false,
        message: "This run has no failed or quota-blocked companies to retry.",
        code: "NOTHING_TO_DO",
      };
    }

    const result = await createResearchRun({
      organizationId,
      contactListId: prior.contactListId,
      initiatedByUserId: user.id,
      failuresOnly: true,
      retryOfRunId: prior.id,
      scoringRunId: prior.scoringRunId ?? undefined,
    });

    if (!result.ok) {
      return {
        ok: false,
        message: result.message,
        code: result.code,
        activeRunId: "activeRunId" in result ? result.activeRunId : undefined,
      };
    }

    const revalidatePathname = prior.scoringRunId
      ? `/scoring/${prior.scoringRunId}`
      : `/lists/${prior.contactListId}`;
    revalidatePath(revalidatePathname);

    return {
      ok: true,
      message: `Retrying ${result.run.totalCompanies} failed or blocked companies in the background.`,
      runId: result.run.id,
      run: result.run,
    };
  } catch (error) {
    const message =
      error instanceof TenantError
        ? error.message
        : "Unable to retry company research.";
    return { ok: false, message };
  }
}

export type ResearchActionResult = {
  ok: boolean;
  message: string;
};

export async function refreshCompanyResearchAction(
  _prev: ResearchActionResult | null,
  formData: FormData,
): Promise<ResearchActionResult> {
  try {
    const companyId = requiredString(formData, "companyId");
    if (!companyId) {
      return { ok: false, message: "Company is required." };
    }

    const contactListId = requiredString(formData, "contactListId");
    if (contactListId) {
      const actor = await getWorkActor();
      const { prisma } = await import("@/lib/prisma");
      const list = await prisma.contactList.findFirst({
        where: { id: contactListId, organizationId: actor.organizationId },
        select: { ownerUserId: true },
      });
      if (!list) throw new TenantError(`${vocab.contact.Singular} ${vocab.list.singular} was not found.`);
      assertCanModifyOwnedWork(actor, list.ownerUserId, "Contact list");
    }
    const result = await researchCompany(companyId, { force: true });
    revalidatePath(`/companies/${companyId}`);
    if (contactListId) {
      revalidatePath(`/lists/${contactListId}`);
    }
    if (result.verificationRequired) {
      return {
        ok: false,
        message:
          result.reason ??
          "Verify your email address to continue with this action.",
      };
    }
    if (result.quotaBlocked) {
      return {
        ok: false,
        message:
          result.reason ??
          formatResearchAllowanceExhausted(0) +
            ` Add capacity at ${RESEARCH_BILLING_HREF}.`,
      };
    }
    return { ok: true, message: "Research refreshed." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : "Unable to refresh company research.",
    };
  }
}

export async function updateManualCompanyResearchAction(
  _prev: ResearchActionResult | null,
  formData: FormData,
): Promise<ResearchActionResult> {
  try {
    const companyId = requiredString(formData, "companyId");
    if (!companyId) {
      return { ok: false, message: "Company is required." };
    }

    await updateManualCompanyResearch({
      companyId,
      companySummary: requiredString(formData, "companySummary") || null,
      whatTheySell: requiredString(formData, "whatTheySell") || null,
      estimatedAov: requiredString(formData, "estimatedAov") || null,
      aovReasoning: requiredString(formData, "aovReasoning") || null,
      customerTypes: parseLineList(
        String(formData.get("customerTypes") ?? ""),
      ),
      primaryMarkets: parseLineList(
        String(formData.get("primaryMarkets") ?? ""),
      ),
      businessModel: requiredString(formData, "businessModel") || null,
      companySizeContext: requiredString(formData, "companySizeContext") || null,
      relevantTechnologies: parseLineList(
        String(formData.get("relevantTechnologies") ?? ""),
      ),
      buyingSignals: parseLineList(
        String(formData.get("buyingSignals") ?? ""),
      ),
      riskSignals: parseLineList(String(formData.get("riskSignals") ?? "")),
    });

    revalidatePath(`/companies/${companyId}`);
    return { ok: true, message: "Manual research saved." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof TenantError
          ? error.message
          : "Unable to save manual company research.",
    };
  }
}

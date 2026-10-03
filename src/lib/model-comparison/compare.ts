/**
 * Read-only model comparison for one application.
 * Builds each step with the production message builders, calls the existing
 * providers with an explicit model, and does not write database rows.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AiConfig } from "@/lib/ai/config";
import {
  getConsultationAiConfig,
  getConsultationReplyAiConfig,
  getResearchAiConfig,
} from "@/lib/ai/config";
import { createAiProvider } from "@/lib/ai/provider";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type {
  AiMessage,
  AiStructuredRequest,
  AiUsageMetadata,
} from "@/lib/ai/types";
import { applicationSummaryShellSchema } from "@/lib/application-summary/contract";
import { applicationSummaryShellModelMessages } from "@/lib/application-summary/service";
import { employerWebsiteAnchor } from "@/lib/application/company-website";
import { consultationPlanSchema } from "@/lib/consultation/contract";
import { buildConsultationCoachMessagesForCampaign } from "@/lib/consultation/service";
import {
  EXPERIMENTAL_LEAN_DECISION_INSTRUCTIONS,
  EXPERIMENTAL_LEAN_WRITING_INSTRUCTIONS,
  EXPERIMENTAL_PLANNING_DECISION_INSTRUCTIONS,
  EXPERIMENTAL_PLANNING_WRITING_INSTRUCTIONS,
  LEAN_DECISION_SCHEMA_NAME,
  LEAN_WRITING_SCHEMA_NAME,
  PLANNING_DECISION_SCHEMA_NAME,
  PLANNING_WRITING_SCHEMA_NAME,
  combineLeanDecisionAndWriting,
  formatExperimentalSplit,
  formatLeanSplit,
  leanDecisionMessages,
  leanDecisionSchema,
  leanWritingMessages,
  leanWritingSchema,
  planningDecisionMessages,
  planningDecisionSchema,
  planningWritingMessages,
  planningWritingSchema,
  suppliedEvidenceIds,
} from "@/lib/model-comparison/plan-split-experiment";
import { deriveCareerStage } from "@/lib/consultation/career-stage";
import { careerWalkThroughAlreadyAsked } from "@/lib/consultation/question-detection";
import { askedQuestionsFromTurns } from "@/lib/consultation/questions";
import { deriveRecentRoles } from "@/lib/consultation/recent-roles";
import {
  countAllCountedCoachingQuestions,
  countNonRoleExpertiseQuestions,
  roleExpertiseFillRange,
  roleExpertiseQuestionMessages,
  roleExpertiseQuestionsResultSchema,
  type RoleExpertiseJobInputs,
} from "@/lib/consultation/role-expertise";
import { estimateEventCostUsd } from "@/lib/platform/cost";
import { listAiModelRates, type AiModelRateRow } from "@/lib/platform/model-rates";
import { prisma } from "@/lib/prisma-client";
import {
  emptyCandidateProfile,
  parseCandidateProfileSafe,
} from "@/lib/product-research/candidate-profile";
import { MAX_EMPLOYER_RESEARCH_SEARCHES } from "@/lib/research/source-policy";
import {
  AiCompanyResearchProvider,
  type AutomatedCompanyResearchResult,
} from "@/lib/research/provider";
import type { CompanyResearchInput } from "@/lib/research/types";
import { DEFAULT_RESEARCH_POLICY_VALUES } from "@/lib/usage/defaults";

export const COMPARISON_MODELS = ["gpt-5.6-terra", "gpt-5.6-luna"] as const;
export type ComparisonModel = (typeof COMPARISON_MODELS)[number];

export const COMPARISON_STEPS = [
  "planning",
  "questions",
  "cheatsheet",
  "research",
] as const;
export type ComparisonStep = (typeof COMPARISON_STEPS)[number];

/** Render web service shell. Env vars are already on the service. */
export const RENDER_SHELL_COMMAND =
  "tsx --conditions=react-server scripts/compare-models.ts --campaign <campaignId> [--steps planning,questions,cheatsheet,research] [--dry-run] [--fresh] [--mode current|split]";

export const COMPARISON_MODES = ["current", "split"] as const;
export type ComparisonMode = (typeof COMPARISON_MODES)[number];

/**
 * OpenAI bills reasoning tokens as output tokens. Responses usage reports
 * them inside output_tokens (output_tokens_details.reasoning_tokens is a
 * subset). Cost below prices output tokens once and does not add reasoning
 * tokens again.
 */
export const REASONING_TOKENS_BILLING_NOTE =
  "Reasoning tokens are part of billed output tokens. OpenAI includes output_tokens_details.reasoning_tokens inside output_tokens and bills them as output tokens. This report prices output tokens once and does not add reasoning tokens again.";

export type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  /** Null when the provider did not return a separate reasoning count. */
  reasoningTokens: number | null;
  webSearchCalls: number;
  providerCalls: number;
};

export type VariantCall = {
  label: string;
  model: ComparisonModel;
  usage: UsageTotals;
  costUsd: number;
  rated: boolean;
};

export type PlanningVariantResult = {
  id: "terra-today" | "split" | "luna-today" | "lean-split";
  label: string;
  output: string;
  calls: VariantCall[];
  costUsd: number;
  inputPreview: string;
};

export type ModelStepResult = {
  model: ComparisonModel;
  output: string;
  inputPreview: string;
  usage: UsageTotals;
  costUsd: number;
  rated: boolean;
  skippedReason: string | null;
};

export type StepComparison = {
  step: ComparisonStep;
  models: ModelStepResult[];
  /** Set for planning when --mode split. Other steps stay terra versus luna. */
  planningVariants?: PlanningVariantResult[];
};

export type ModelComparisonReport = {
  campaignId: string;
  campaignName: string;
  dryRun: boolean;
  fresh: boolean;
  mode: ComparisonMode;
  wroteToDatabase: false;
  steps: StepComparison[];
  totals: Record<ComparisonModel, number>;
  markdown: string;
  reportPath: string | null;
};

const EMPTY_USAGE: UsageTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: null,
  webSearchCalls: 0,
  providerCalls: 0,
};

function addUsage(usage: AiUsageMetadata | null | undefined): UsageTotals {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    cachedInputTokens: usage?.cachedInputTokens ?? 0,
    cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
    reasoningTokens:
      typeof usage?.reasoningTokens === "number" ? usage.reasoningTokens : null,
    webSearchCalls: usage?.webSearchCalls ?? 0,
    providerCalls: 1,
  };
}

function money(value: number): string {
  return `$${value.toFixed(6)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function previewMessages(messages: AiMessage[]): string {
  return messages
    .map((message) => `## ${message.role}\n${message.content}`)
    .join("\n\n");
}

function costFor(
  model: string,
  provider: string,
  usage: UsageTotals,
  rates: AiModelRateRow[],
): { costUsd: number; rated: boolean } {
  const event = {
    provider,
    model,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    outputTokens: usage.outputTokens,
    webSearchCalls: usage.webSearchCalls,
    occurredAt: new Date(),
  };
  const costUsd = estimateEventCostUsd(event, rates);
  const rated =
    rates.some((rate) => rate.model === model || rate.model === "*") &&
    (usage.providerCalls > 0 || usage.webSearchCalls > 0 || usage.inputTokens > 0);
  return { costUsd, rated: rated && (costUsd > 0 || usage.providerCalls === 0) };
}

async function loadRates(): Promise<AiModelRateRow[]> {
  return listAiModelRates();
}

async function loadCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      ownerUserId: true,
      companyResearchNotes: true,
      product: { select: { profileJson: true } },
      jobRequirement: {
        select: {
          title: true,
          companyName: true,
          seniority: true,
          location: true,
          workArrangement: true,
          requiredItems: true,
          preferredItems: true,
          responsibilities: true,
          scorecardJson: true,
          rawText: true,
          postingUrl: true,
          suppliedEmployerWebsite: true,
          companyId: true,
          company: {
            select: {
              id: true,
              name: true,
              website: true,
              normalizedDomain: true,
              industry: true,
              employeeCount: true,
              location: true,
            },
          },
        },
      },
      consultationSession: { select: { id: true } },
    },
  });
  if (!campaign) {
    throw new Error(`Application ${campaignId} was not found.`);
  }
  return campaign;
}

async function planningMessages(
  campaignId: string,
  organizationId: string,
  fresh: boolean,
) {
  return buildConsultationCoachMessagesForCampaign({
    organizationId,
    campaignId,
    fresh,
  });
}

async function questionMessages(
  campaign: Awaited<ReturnType<typeof loadCampaign>>,
  fresh: boolean,
): Promise<{ messages: AiMessage[]; skippedReason: string | null }> {
  const requirement = campaign.jobRequirement;
  if (!requirement) {
    return { messages: [], skippedReason: "This application has no job requirement." };
  }
  const parsed = campaign.product.profileJson
    ? parseCandidateProfileSafe(campaign.product.profileJson)
    : { ok: true as const, profile: emptyCandidateProfile() };
  if (!parsed.ok) {
    return { messages: [], skippedReason: "Personal profile could not be read." };
  }
  const turns =
    fresh || !campaign.consultationSession
      ? []
      : await prisma.consultationTurn.findMany({
          where: { sessionId: campaign.consultationSession.id },
          orderBy: { sequence: "asc" },
        });
  const asked = askedQuestionsFromTurns(turns);
  const counted = countAllCountedCoachingQuestions(asked);
  const range = roleExpertiseFillRange(countNonRoleExpertiseQuestions(asked));
  if (counted >= 20 || range.maxCount === 0) {
    return {
      messages: [],
      skippedReason:
        "Production would not select more best-practice questions for this application.",
    };
  }
  const job: RoleExpertiseJobInputs = {
    title: requirement.title,
    companyName: requirement.companyName,
    seniority: requirement.seniority,
    location: requirement.location,
    workArrangement: requirement.workArrangement,
    requiredItems: requirement.requiredItems,
    preferredItems: requirement.preferredItems,
    responsibilities: requirement.responsibilities,
    scorecardJson: requirement.scorecardJson,
  };
  const careerStage = deriveCareerStage(parsed.profile);
  const messages = await roleExpertiseQuestionMessages({
    organizationId: campaign.organizationId,
    campaignId: campaign.id,
    job,
    minCount: range.minCount,
    maxCount: range.maxCount,
    askedQuestions: asked,
    chronologyAlreadyAsked: careerWalkThroughAlreadyAsked(turns),
    recentRoles: deriveRecentRoles(parsed.profile, new Date(), careerStage),
    careerStage,
  });
  return { messages, skippedReason: null };
}

async function researchInput(
  campaign: Awaited<ReturnType<typeof loadCampaign>>,
): Promise<{ input: CompanyResearchInput | null; skippedReason: string | null }> {
  const requirement = campaign.jobRequirement;
  const company = requirement?.company;
  if (!requirement || !company) {
    return {
      input: null,
      skippedReason: "This application has no employer company to research.",
    };
  }
  const anchor = employerWebsiteAnchor({
    suppliedEmployerWebsite: requirement.suppliedEmployerWebsite,
    companyWebsite: company.website,
    companyDomain: company.normalizedDomain,
  });
  if (!anchor) {
    return {
      input: null,
      skippedReason: "Production skips employer research until the company website is known.",
    };
  }
  const policy = await prisma.researchPolicy.findUnique({
    where: { organizationId: campaign.organizationId },
  });
  const depth = policy
    ? {
        maxSearchQueriesPerCompany: policy.maxSearchQueriesPerCompany,
        maxSourcesPerCompany: policy.maxSourcesPerCompany,
        researchFreshnessDays: policy.researchFreshnessDays,
      }
    : {
        maxSearchQueriesPerCompany:
          DEFAULT_RESEARCH_POLICY_VALUES.maxSearchQueriesPerCompany,
        maxSourcesPerCompany: DEFAULT_RESEARCH_POLICY_VALUES.maxSourcesPerCompany,
        researchFreshnessDays: DEFAULT_RESEARCH_POLICY_VALUES.researchFreshnessDays,
      };
  return {
    skippedReason: null,
    input: {
      organizationId: campaign.organizationId,
      companyId: company.id,
      name: company.name,
      website: anchor.website,
      normalizedDomain: anchor.domain,
      industry: company.industry,
      employeeCount: company.employeeCount,
      location: company.location,
      depthPolicy: depth,
      seekerSuppliedNotes: campaign.companyResearchNotes?.trim() || undefined,
      campaignId: campaign.id,
      userId: campaign.ownerUserId,
      postingTitle: requirement.title,
      postingUrl: requirement.postingUrl,
      postingText: requirement.rawText,
    },
  };
}

function formatPlan(data: unknown): string {
  const plan = consultationPlanSchema.parse(data);
  const questions = plan.questions
    .map((question, index) => `${index + 1}. ${question.text}`)
    .join("\n");
  return [plan.commentary, "", "Questions:", questions || "(none)"].join("\n");
}

function formatQuestions(data: unknown): string {
  const parsed = roleExpertiseQuestionsResultSchema.parse(data);
  return (
    parsed.questions
      .map((question, index) => `${index + 1}. ${question.text}`)
      .join("\n") || "(none)"
  );
}

function formatShell(data: unknown): string {
  const shell = applicationSummaryShellSchema.parse(data);
  const lines = [
    shell.overview.companyBackground.text,
    "",
    "Job requirements:",
    ...shell.overview.jobRequirements.map((item) => `- ${item.text}`),
    "",
    "Where the seeker shines:",
    ...shell.overview.whereSeekerShines.map((item) => `- ${item.text}`),
  ];
  return lines.join("\n");
}

function formatResearch(result: AutomatedCompanyResearchResult): string {
  const sources = result.sources
    .map((source) => `- ${source.url}${source.title ? ` (${source.title})` : ""}`)
    .join("\n");
  return [
    `Company summary: ${result.companySummary ?? ""}`,
    `What they do: ${result.whatTheySell ?? ""}`,
    `Business model: ${result.businessModel ?? ""}`,
    `Size: ${result.companySizeContext ?? ""}`,
    `Job focus: ${result.jobFocus ?? ""}`,
    `Job focus detail: ${result.jobFocusDetail ?? ""}`,
    `Hiring signals: ${result.hiringSignals.join("; ")}`,
    `Risk signals: ${result.riskSignals.join("; ")}`,
    `Stopped: ${result.stoppedReason ?? ""}`,
    "Sources:",
    sources || "(none)",
  ].join("\n");
}

async function callStructured(input: {
  config: AiConfig;
  model: ComparisonModel;
  messages: AiMessage[];
  schemaKey: "consultationPlan" | "roleExpertiseQuestions" | "applicationSummaryShell";
  schemaOverride?: {
    schema: AiStructuredRequest<unknown>["schema"];
    schemaName: string;
  };
}): Promise<{ data: unknown; usage: UsageTotals }> {
  const provider = createAiProvider({ ...input.config, model: input.model });
  const response = await provider.generateStructured({
    ...structuredOutputRequest(input.schemaKey),
    ...(input.schemaOverride ?? {}),
    messages: input.messages,
  } as AiStructuredRequest<unknown>);
  return { data: response.data, usage: addUsage(response.usage) };
}

function searchCeiling(model: string, rates: AiModelRateRow[]): number {
  return estimateEventCostUsd(
    {
      provider: "openai-responses",
      model,
      inputTokens: 0,
      outputTokens: 0,
      webSearchCalls: MAX_EMPLOYER_RESEARCH_SEARCHES,
      occurredAt: new Date(),
    },
    rates,
  );
}

function pricedCall(input: {
  label: string;
  model: ComparisonModel;
  usage: UsageTotals;
  rates: AiModelRateRow[];
}): VariantCall {
  const priced = costFor(input.model, "openai-responses", input.usage, input.rates);
  return {
    label: input.label,
    model: input.model,
    usage: input.usage,
    costUsd: priced.costUsd,
    rated: priced.rated,
  };
}

async function runPlanningSplit(input: {
  campaign: Awaited<ReturnType<typeof loadCampaign>>;
  rates: AiModelRateRow[];
  dryRun: boolean;
  fresh: boolean;
}): Promise<PlanningVariantResult[]> {
  const messages = await planningMessages(
    input.campaign.id,
    input.campaign.organizationId,
    input.fresh,
  );
  if (input.dryRun) {
    const decisionPreview = previewMessages(planningDecisionMessages(messages));
    const writingPreview = previewMessages(
      planningWritingMessages(messages, {
        assessments: [],
        questions: [],
      }),
    );
    return [
      {
        id: "terra-today",
        label: "Today's planning on gpt-5.6-terra",
        output: "",
        calls: [],
        costUsd: 0,
        inputPreview: previewMessages(messages),
      },
      {
        id: "split",
        label: "Split: terra decision, then luna writing",
        output: "",
        calls: [],
        costUsd: 0,
        inputPreview: `${decisionPreview}\n\n---\n\n${writingPreview}`,
      },
      {
        id: "luna-today",
        label: "Today's planning on gpt-5.6-luna",
        output: "",
        calls: [],
        costUsd: 0,
        inputPreview: previewMessages(messages),
      },
      {
        id: "lean-split",
        label: "Lean split: terra questions and strengths, then luna",
        output: "",
        calls: [],
        costUsd: 0,
        inputPreview: `${previewMessages(leanDecisionMessages(messages))}\n\n---\n\n${previewMessages(
          leanWritingMessages(messages, { assessments: [], questions: [] }),
        )}`,
      },
    ];
  }

  const terraToday = await callStructured({
    config: getConsultationAiConfig(),
    model: "gpt-5.6-terra",
    messages,
    schemaKey: "consultationPlan",
  });
  const decisionCalled = await callStructured({
    config: getConsultationAiConfig(),
    model: "gpt-5.6-terra",
    messages: planningDecisionMessages(messages),
    schemaKey: "consultationPlan",
    schemaOverride: {
      schema: planningDecisionSchema,
      schemaName: PLANNING_DECISION_SCHEMA_NAME,
    },
  });
  const decision = planningDecisionSchema.parse(decisionCalled.data);
  let writing: ReturnType<typeof planningWritingSchema.parse> | null = null;
  let writingError: string | null = null;
  let writingUsage: UsageTotals | null = null;
  try {
    const writingCalled = await callStructured({
      config: getConsultationReplyAiConfig(),
      model: "gpt-5.6-luna",
      messages: planningWritingMessages(messages, decision),
      schemaKey: "consultationPlan",
      schemaOverride: {
        schema: planningWritingSchema,
        schemaName: PLANNING_WRITING_SCHEMA_NAME,
      },
    });
    writingUsage = writingCalled.usage;
    writing = planningWritingSchema.parse(writingCalled.data);
  } catch (error) {
    writingError = error instanceof Error ? error.message : "Writing call failed.";
  }
  const lunaToday = await callStructured({
    config: getConsultationAiConfig(),
    model: "gpt-5.6-luna",
    messages,
    schemaKey: "consultationPlan",
  });
  const terraCall = pricedCall({
    label: "Today's planning",
    model: "gpt-5.6-terra",
    usage: terraToday.usage,
    rates: input.rates,
  });
  const decisionCall = pricedCall({
    label: "Decision",
    model: "gpt-5.6-terra",
    usage: decisionCalled.usage,
    rates: input.rates,
  });
  const writingCall = writingUsage
    ? pricedCall({
        label: "Writing",
        model: "gpt-5.6-luna",
        usage: writingUsage,
        rates: input.rates,
      })
    : null;
  const lunaCall = pricedCall({
    label: "Today's planning",
    model: "gpt-5.6-luna",
    usage: lunaToday.usage,
    rates: input.rates,
  });
  const leanDecisionCalled = await callStructured({
    config: getConsultationAiConfig(),
    model: "gpt-5.6-terra",
    messages: leanDecisionMessages(messages),
    schemaKey: "consultationPlan",
    schemaOverride: {
      schema: leanDecisionSchema,
      schemaName: LEAN_DECISION_SCHEMA_NAME,
    },
  });
  const leanDecision = leanDecisionSchema.parse(leanDecisionCalled.data);
  let leanWritingRaw: unknown = null;
  let leanWritingError: string | null = null;
  let leanWritingUsage: UsageTotals | null = null;
  try {
    const leanWritingCalled = await callStructured({
      config: getConsultationReplyAiConfig(),
      model: "gpt-5.6-luna",
      messages: leanWritingMessages(messages, leanDecision),
      schemaKey: "consultationPlan",
      schemaOverride: {
        schema: leanWritingSchema,
        schemaName: LEAN_WRITING_SCHEMA_NAME,
      },
    });
    leanWritingUsage = leanWritingCalled.usage;
    leanWritingRaw = leanWritingCalled.data;
  } catch (error) {
    leanWritingError =
      error instanceof Error ? error.message : "Lean writing call failed.";
  }
  const supplied = suppliedEvidenceIds(messages);
  const leanCombined = leanWritingRaw
    ? combineLeanDecisionAndWriting({
        decision: leanDecision,
        writingRaw: leanWritingRaw,
        suppliedFactIds: supplied.factIds,
        suppliedRoleIds: supplied.roleIds,
      })
    : { plan: null, notes: [] };
  const leanDecisionCall = pricedCall({
    label: "Lean decision",
    model: "gpt-5.6-terra",
    usage: leanDecisionCalled.usage,
    rates: input.rates,
  });
  const leanWritingCall = leanWritingUsage
    ? pricedCall({
        label: "Lean writing",
        model: "gpt-5.6-luna",
        usage: leanWritingUsage,
        rates: input.rates,
      })
    : null;
  return [
    {
      id: "terra-today",
      label: "Today's planning on gpt-5.6-terra",
      output: formatPlan(terraToday.data),
      calls: [terraCall],
      costUsd: terraCall.costUsd,
      inputPreview: "",
    },
    {
      id: "split",
      label: "Split: terra decision, then luna writing",
      output: formatExperimentalSplit({ decision, writing, writingError }),
      calls: writingCall ? [decisionCall, writingCall] : [decisionCall],
      costUsd: decisionCall.costUsd + (writingCall?.costUsd ?? 0),
      inputPreview: "",
    },
    {
      id: "luna-today",
      label: "Today's planning on gpt-5.6-luna",
      output: formatPlan(lunaToday.data),
      calls: [lunaCall],
      costUsd: lunaCall.costUsd,
      inputPreview: "",
    },
    {
      id: "lean-split",
      label: "Lean split: terra questions and strengths, then luna",
      output: formatLeanSplit({
        plan: leanCombined.plan,
        notes: leanCombined.notes,
        writingError: leanWritingError,
      }),
      calls: leanWritingCall
        ? [leanDecisionCall, leanWritingCall]
        : [leanDecisionCall],
      costUsd: leanDecisionCall.costUsd + (leanWritingCall?.costUsd ?? 0),
      inputPreview: "",
    },
  ];
}

async function runOneModel(input: {
  step: ComparisonStep;
  model: ComparisonModel;
  campaign: Awaited<ReturnType<typeof loadCampaign>>;
  rates: AiModelRateRow[];
  dryRun: boolean;
  fresh: boolean;
}): Promise<ModelStepResult> {
  const providerName = "openai-responses";
  if (input.step === "planning") {
    const messages = await planningMessages(
      input.campaign.id,
      input.campaign.organizationId,
      input.fresh,
    );
    if (input.dryRun) {
      return {
        model: input.model,
        output: "",
        inputPreview: previewMessages(messages),
        usage: EMPTY_USAGE,
        costUsd: 0,
        rated: true,
        skippedReason: null,
      };
    }
    const called = await callStructured({
      config: getConsultationAiConfig(),
      model: input.model,
      messages,
      schemaKey: "consultationPlan",
    });
    const priced = costFor(input.model, providerName, called.usage, input.rates);
    return {
      model: input.model,
      output: formatPlan(called.data),
      inputPreview: "",
      usage: called.usage,
      costUsd: priced.costUsd,
      rated: priced.rated,
      skippedReason: null,
    };
  }

  if (input.step === "questions") {
    const built = await questionMessages(input.campaign, input.fresh);
    if (built.skippedReason) {
      return {
        model: input.model,
        output: "",
        inputPreview: "",
        usage: EMPTY_USAGE,
        costUsd: 0,
        rated: true,
        skippedReason: built.skippedReason,
      };
    }
    if (input.dryRun) {
      return {
        model: input.model,
        output: "",
        inputPreview: previewMessages(built.messages),
        usage: EMPTY_USAGE,
        costUsd: 0,
        rated: true,
        skippedReason: null,
      };
    }
    const called = await callStructured({
      config: getConsultationAiConfig(),
      model: input.model,
      messages: built.messages,
      schemaKey: "roleExpertiseQuestions",
    });
    const priced = costFor(input.model, providerName, called.usage, input.rates);
    return {
      model: input.model,
      output: formatQuestions(called.data),
      inputPreview: "",
      usage: called.usage,
      costUsd: priced.costUsd,
      rated: priced.rated,
      skippedReason: null,
    };
  }

  if (input.step === "cheatsheet") {
    const messages = await applicationSummaryShellModelMessages({
      organizationId: input.campaign.organizationId,
      campaignId: input.campaign.id,
    });
    if (input.dryRun) {
      return {
        model: input.model,
        output: "",
        inputPreview: previewMessages(messages),
        usage: EMPTY_USAGE,
        costUsd: 0,
        rated: true,
        skippedReason: null,
      };
    }
    const called = await callStructured({
      config: getConsultationAiConfig(),
      model: input.model,
      messages,
      schemaKey: "applicationSummaryShell",
    });
    const priced = costFor(input.model, providerName, called.usage, input.rates);
    return {
      model: input.model,
      output: formatShell(called.data),
      inputPreview: "",
      usage: called.usage,
      costUsd: priced.costUsd,
      rated: priced.rated,
      skippedReason: null,
    };
  }

  const built = await researchInput(input.campaign);
  if (!built.input) {
    return {
      model: input.model,
      output: "",
      inputPreview: "",
      usage: EMPTY_USAGE,
      costUsd: 0,
      rated: true,
      skippedReason: built.skippedReason,
    };
  }
  if (input.dryRun) {
    return {
      model: input.model,
      output: "",
      inputPreview: JSON.stringify(
        {
          name: built.input.name,
          website: built.input.website,
          normalizedDomain: built.input.normalizedDomain,
          postingTitle: built.input.postingTitle,
          postingText: built.input.postingText,
          seekerSuppliedNotes: built.input.seekerSuppliedNotes ?? null,
          maxSearchQueriesPerCompany: Math.min(
            built.input.depthPolicy?.maxSearchQueriesPerCompany ??
              MAX_EMPLOYER_RESEARCH_SEARCHES,
            MAX_EMPLOYER_RESEARCH_SEARCHES,
          ),
        },
        null,
        2,
      ),
      usage: EMPTY_USAGE,
      costUsd: 0,
      rated: true,
      skippedReason: null,
    };
  }
  const researchConfig = getResearchAiConfig();
  const provider = new AiCompanyResearchProvider({
    model: input.model,
    recordUsage: false,
  });
  const result = await provider.research(built.input);
  const usage: UsageTotals = {
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    cachedInputTokens: result.usage?.cachedInputTokens ?? 0,
    cacheWriteTokens: result.usage?.cacheWriteTokens ?? 0,
    reasoningTokens: null,
    webSearchCalls: result.usage?.webSearchCallCount ?? 0,
    providerCalls: result.searchStagesUsed ?? 0,
  };
  const priced = costFor(
    input.model,
    researchConfig.provider,
    usage,
    input.rates,
  );
  return {
    model: input.model,
    output: formatResearch(result),
    inputPreview: "",
    usage,
    costUsd: priced.costUsd,
    rated: priced.rated,
    skippedReason: null,
  };
}

function reasoningCell(value: number | null): string {
  return value == null ? "not returned" : String(value);
}

function renderCallTable(calls: VariantCall[]): string[] {
  const header = ["| |", ...calls.map((call) => ` ${call.label} (${call.model}) |`)].join("");
  const rule = ["| --- |", ...calls.map(() => " --- |")].join("");
  const row = (label: string, value: (call: VariantCall) => string) =>
    [`| ${label} |`, ...calls.map((call) => ` ${value(call)} |`)].join("");
  return [
    header,
    rule,
    row("Input tokens", (call) => String(call.usage.inputTokens)),
    row("Output tokens", (call) => String(call.usage.outputTokens)),
    row("Reasoning tokens", (call) => reasoningCell(call.usage.reasoningTokens)),
    row("Cached input tokens", (call) => String(call.usage.cachedInputTokens)),
    row("Cache write tokens", (call) => String(call.usage.cacheWriteTokens)),
    row("Provider calls", (call) => String(call.usage.providerCalls)),
    row("Cost", (call) => money(call.costUsd)),
  ];
}

function renderMarkdown(input: {
  campaignId: string;
  campaignName: string;
  dryRun: boolean;
  fresh: boolean;
  mode: ComparisonMode;
  steps: StepComparison[];
  totals: Record<ComparisonModel, number>;
  rates: AiModelRateRow[];
}): string {
  const lines: string[] = [
    "# Model comparison",
    "",
    "Run this from the Render shell for the **web** service (environment variables are already set). It reads one application and does not write to the database.",
    "",
    "```",
    RENDER_SHELL_COMMAND,
    "```",
    "",
    `Application: ${input.campaignName} (\`${input.campaignId}\`)`,
    `Models: ${COMPARISON_MODELS.join(", ")}`,
    `Mode: ${input.mode}`,
    `Fresh: ${input.fresh ? "yes — first Harper round, stored turns left in place" : "no"}`,
    `Dry run: ${input.dryRun ? "yes — no model was called" : "no"}`,
    "wroteToDatabase: false",
    "",
    REASONING_TOKENS_BILLING_NOTE,
    "",
  ];
  if (input.mode === "split") {
    lines.push(
      "## Experimental instructions (not in production)",
      "",
      "These instructions are used only by `--mode split` in this comparison script. They are not Harper's production coach. They need product-owner approval before any production use.",
      "",
      "### Decision (gpt-5.6-terra)",
      "",
      "```",
      EXPERIMENTAL_PLANNING_DECISION_INSTRUCTIONS,
      "```",
      "",
      "### Writing (gpt-5.6-luna)",
      "",
      "```",
      EXPERIMENTAL_PLANNING_WRITING_INSTRUCTIONS,
      "```",
      "",
      "### Lean decision (gpt-5.6-terra)",
      "",
      "```",
      EXPERIMENTAL_LEAN_DECISION_INSTRUCTIONS,
      "```",
      "",
      "### Lean writing (gpt-5.6-luna)",
      "",
      "```",
      EXPERIMENTAL_LEAN_WRITING_INSTRUCTIONS,
      "```",
      "",
    );
  }
  if (input.dryRun) {
    lines.push(
      "Estimated token cost is $0.000000 because a dry run does not call a model.",
      `Research web-search ceiling at the stored rates, ${MAX_EMPLOYER_RESEARCH_SEARCHES} searches: ${COMPARISON_MODELS.map((model) => `${model} ${money(searchCeiling(model, input.rates))}`).join("; ")} per model.`,
      "",
    );
  }
  for (const step of input.steps) {
    lines.push(`## ${step.step}`, "");
    if (step.planningVariants) {
      if (input.dryRun) {
        for (const variant of step.planningVariants) {
          lines.push(`### ${variant.label}`, "", "```", variant.inputPreview, "```", "");
        }
        lines.push("");
        continue;
      }
      for (const variant of step.planningVariants) {
        lines.push(`### ${variant.label}`, "", "```", variant.output, "```", "");
        if (variant.calls.length > 0) {
          lines.push(...renderCallTable(variant.calls), "");
        }
      }
      const terraToday = step.planningVariants.find(
        (variant) => variant.id === "terra-today",
      );
      const split = step.planningVariants.find((variant) => variant.id === "split");
      const lean = step.planningVariants.find((variant) => variant.id === "lean-split");
      if (terraToday) {
        lines.push(`Today's terra total: ${money(terraToday.costUsd)}`);
      }
      if (split) {
        lines.push(`Split total: ${money(split.costUsd)}`);
      }
      if (lean) {
        lines.push(`Lean split total: ${money(lean.costUsd)}`);
      }
      if (terraToday || split || lean) lines.push("");
      continue;
    }
    const [left, right] = step.models;
    if (!left || !right) continue;
    if (left.skippedReason) {
      lines.push(left.skippedReason, "");
      continue;
    }
    if (input.dryRun) {
      lines.push("### Input this step would send", "", "```", left.inputPreview, "```", "");
      lines.push(
        `| Model | Estimated token cost |`,
        `| --- | --- |`,
        `| ${left.model} | ${money(left.costUsd)} |`,
        `| ${right.model} | ${money(right.costUsd)} |`,
        "",
      );
      continue;
    }
    lines.push(
      "<table>",
      "<tr>",
      `<th>${escapeHtml(left.model)}</th>`,
      `<th>${escapeHtml(right.model)}</th>`,
      "</tr>",
      "<tr>",
      `<td><pre>${escapeHtml(left.output)}</pre></td>`,
      `<td><pre>${escapeHtml(right.output)}</pre></td>`,
      "</tr>",
      "</table>",
      "",
      "| | " + left.model + " | " + right.model + " |",
      "| --- | --- | --- |",
      `| Input tokens | ${left.usage.inputTokens} | ${right.usage.inputTokens} |`,
      `| Output tokens | ${left.usage.outputTokens} | ${right.usage.outputTokens} |`,
      `| Reasoning tokens | ${reasoningCell(left.usage.reasoningTokens)} | ${reasoningCell(right.usage.reasoningTokens)} |`,
      `| Cached input tokens | ${left.usage.cachedInputTokens} | ${right.usage.cachedInputTokens} |`,
      `| Cache write tokens | ${left.usage.cacheWriteTokens} | ${right.usage.cacheWriteTokens} |`,
      `| Web searches | ${left.usage.webSearchCalls} | ${right.usage.webSearchCalls} |`,
      `| Provider calls | ${left.usage.providerCalls} | ${right.usage.providerCalls} |`,
      `| Cost | ${money(left.costUsd)} | ${money(right.costUsd)} |`,
      "",
    );
  }
  lines.push(
    "## Total",
    "",
    `| Model | Cost |`,
    `| --- | --- |`,
    ...COMPARISON_MODELS.map((model) => `| ${model} | ${money(input.totals[model])} |`),
    "",
  );
  return lines.join("\n");
}

export function parseComparisonMode(raw: string | undefined): ComparisonMode {
  if (!raw?.trim()) return "current";
  if (raw === "current" || raw === "split") return raw;
  throw new Error(`Unknown mode "${raw}". Use current or split.`);
}

export function parseComparisonSteps(raw: string | undefined): ComparisonStep[] {
  if (!raw?.trim()) return [...COMPARISON_STEPS];
  const steps = raw.split(",").map((step) => step.trim()).filter(Boolean);
  const allowed = new Set<string>(COMPARISON_STEPS);
  for (const step of steps) {
    if (!allowed.has(step)) {
      throw new Error(
        `Unknown step "${step}". Use ${COMPARISON_STEPS.join(", ")}.`,
      );
    }
  }
  return steps as ComparisonStep[];
}

export async function runModelComparison(input: {
  campaignId: string;
  steps?: readonly ComparisonStep[];
  dryRun?: boolean;
  fresh?: boolean;
  mode?: ComparisonMode;
  writeReport?: boolean;
  reportDirectory?: string;
}): Promise<ModelComparisonReport> {
  const steps = input.steps?.length ? [...input.steps] : [...COMPARISON_STEPS];
  const dryRun = input.dryRun === true;
  const fresh = input.fresh === true;
  const mode: ComparisonMode = input.mode ?? "current";
  const campaign = await loadCampaign(input.campaignId);
  const rates = await loadRates();
  const comparisons: StepComparison[] = [];
  for (const step of steps) {
    if (step === "planning" && mode === "split") {
      const planningVariants = await runPlanningSplit({
        campaign,
        rates,
        dryRun,
        fresh,
      });
      comparisons.push({ step, models: [], planningVariants });
      continue;
    }
    const models: ModelStepResult[] = [];
    for (const model of COMPARISON_MODELS) {
      models.push(
        await runOneModel({ step, model, campaign, rates, dryRun, fresh }),
      );
    }
    comparisons.push({ step, models });
  }
  const totals = {
    "gpt-5.6-terra": 0,
    "gpt-5.6-luna": 0,
  } satisfies Record<ComparisonModel, number>;
  for (const step of comparisons) {
    if (step.planningVariants) {
      for (const variant of step.planningVariants) {
        for (const call of variant.calls) {
          totals[call.model] += call.costUsd;
        }
      }
      continue;
    }
    for (const model of step.models) {
      totals[model.model] += model.costUsd;
    }
  }
  const markdown = renderMarkdown({
    campaignId: campaign.id,
    campaignName: campaign.name,
    dryRun,
    fresh,
    mode,
    steps: comparisons,
    totals,
    rates,
  });
  let reportPath: string | null = null;
  if (input.writeReport !== false) {
    const directory = input.reportDirectory ?? process.cwd();
    mkdirSync(directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    reportPath = join(directory, `model-comparison-${campaign.id}-${stamp}.md`);
    writeFileSync(reportPath, markdown, "utf8");
  }
  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    dryRun,
    fresh,
    mode,
    wroteToDatabase: false,
    steps: comparisons,
    totals,
    markdown,
    reportPath,
  };
}

/**
 * Row count and latest updatedAt for every public table that stores an
 * organizationId, limited to one organization. Used to prove a comparison
 * run did not insert or update that organization's rows.
 */
export async function snapshotOrganizationTables(
  organizationId: string,
): Promise<Map<string, { count: number; maxUpdatedAt: string | null }>> {
  const tables = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN information_schema.columns col
      ON col.table_schema = 'public'
     AND col.table_name = c.relname
     AND col.column_name = 'organizationId'
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `;
  const snapshot = new Map<string, { count: number; maxUpdatedAt: string | null }>();
  for (const table of tables) {
    if (!/^[A-Za-z0-9_]+$/.test(table.name)) continue;
    const quoted = `"${table.name}"`;
    const counts = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM ${quoted} WHERE "organizationId" = $1`,
      organizationId,
    );
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${table.name}
        AND column_name = 'updatedAt'
    `;
    let maxUpdatedAt: string | null = null;
    if (columns.length > 0) {
      const maxRows = await prisma.$queryRawUnsafe<Array<{ max: Date | null }>>(
        `SELECT MAX("updatedAt") AS max FROM ${quoted} WHERE "organizationId" = $1`,
        organizationId,
      );
      const max = maxRows[0]?.max;
      maxUpdatedAt = max ? new Date(max).toISOString() : null;
    }
    snapshot.set(table.name, {
      count: Number(counts[0]?.count ?? 0),
      maxUpdatedAt,
    });
  }
  return snapshot;
}

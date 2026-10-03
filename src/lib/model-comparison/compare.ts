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
  "tsx --conditions=react-server scripts/compare-models.ts --campaign <campaignId> [--steps planning,questions,cheatsheet,research] [--dry-run]";

export type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  webSearchCalls: number;
  providerCalls: number;
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
};

export type ModelComparisonReport = {
  campaignId: string;
  campaignName: string;
  dryRun: boolean;
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
  webSearchCalls: 0,
  providerCalls: 0,
};

function addUsage(usage: AiUsageMetadata | null | undefined): UsageTotals {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    cachedInputTokens: usage?.cachedInputTokens ?? 0,
    cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
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

async function planningMessages(campaignId: string, organizationId: string) {
  return buildConsultationCoachMessagesForCampaign({
    organizationId,
    campaignId,
  });
}

async function questionMessages(
  campaign: Awaited<ReturnType<typeof loadCampaign>>,
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
  const turns = campaign.consultationSession
    ? await prisma.consultationTurn.findMany({
        where: { sessionId: campaign.consultationSession.id },
        orderBy: { sequence: "asc" },
      })
    : [];
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
}): Promise<{ data: unknown; usage: UsageTotals }> {
  const provider = createAiProvider({ ...input.config, model: input.model });
  const response = await provider.generateStructured({
    ...structuredOutputRequest(input.schemaKey),
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

async function runOneModel(input: {
  step: ComparisonStep;
  model: ComparisonModel;
  campaign: Awaited<ReturnType<typeof loadCampaign>>;
  rates: AiModelRateRow[];
  dryRun: boolean;
}): Promise<ModelStepResult> {
  const providerName = "openai-responses";
  if (input.step === "planning") {
    const messages = await planningMessages(
      input.campaign.id,
      input.campaign.organizationId,
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
    const built = await questionMessages(input.campaign);
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

function renderMarkdown(input: {
  campaignId: string;
  campaignName: string;
  dryRun: boolean;
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
    `Dry run: ${input.dryRun ? "yes — no model was called" : "no"}`,
    "",
  ];
  if (input.dryRun) {
    lines.push(
      "Estimated token cost is $0.000000 because a dry run does not call a model.",
      `Research web-search ceiling at the stored rates, ${MAX_EMPLOYER_RESEARCH_SEARCHES} searches: ${COMPARISON_MODELS.map((model) => `${model} ${money(searchCeiling(model, input.rates))}`).join("; ")} per model.`,
      "",
    );
  }
  for (const step of input.steps) {
    lines.push(`## ${step.step}`, "");
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
  writeReport?: boolean;
  reportDirectory?: string;
}): Promise<ModelComparisonReport> {
  const steps = input.steps?.length ? [...input.steps] : [...COMPARISON_STEPS];
  const dryRun = input.dryRun === true;
  const campaign = await loadCampaign(input.campaignId);
  const rates = await loadRates();
  const comparisons: StepComparison[] = [];
  for (const step of steps) {
    const models: ModelStepResult[] = [];
    for (const model of COMPARISON_MODELS) {
      models.push(
        await runOneModel({ step, model, campaign, rates, dryRun }),
      );
    }
    comparisons.push({ step, models });
  }
  const totals = {
    "gpt-5.6-terra": 0,
    "gpt-5.6-luna": 0,
  } satisfies Record<ComparisonModel, number>;
  for (const step of comparisons) {
    for (const model of step.models) {
      totals[model.model] += model.costUsd;
    }
  }
  const markdown = renderMarkdown({
    campaignId: campaign.id,
    campaignName: campaign.name,
    dryRun,
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

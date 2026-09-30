import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assetGenerationFingerprint,
  resumeAssetFingerprint,
} from "@/lib/application-assets/paid-inputs";
import { COVER_LETTER_ASSET_PROMPT_VERSION } from "@/lib/application-assets/contract";
import { COVER_LETTER_ASSET_INSTRUCTIONS } from "@/lib/prompt-content/application-assets";
import { applicationAssetConfig } from "@/lib/product-config/application-assets";
import { consultationConversationCopy } from "@/lib/product-config/consultation";
import { consultationStatementLabels } from "@/lib/product-config/consultation";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

const COVER_LETTER_VARIATION_TEXT =
  "Vary how sentences and paragraphs begin. Never start two paragraphs with the same phrase. When two examples come from the same employer, name the employer once and connect the examples.";

const minimalResumeContext = {
  organizationId: "org",
  userId: "user",
  campaign: {
    id: "camp",
    name: "App",
    ownerUserId: "user",
    applicationGuidance: "tailor",
    appliedAt: null,
    applicationProgress: null,
  },
  profile: {
    schemaVersion: 1,
    identity: {},
    direction: {},
    experience: [],
    skills: [],
    education: [],
    credentials: [],
  },
  requirement: {
    id: "req",
    title: "Director",
    companyName: "Acme",
    location: null,
    workArrangement: null,
    seniority: "senior",
    reportingLine: null,
    compensationRange: null,
    responsibilities: [],
    requiredItems: [],
    preferredItems: [],
    scorecard: null,
    rawText: "Director role",
  },
  companyResearch: {
    id: "res",
    companySummary: "Acme sells widgets",
    whatTheySell: "Widgets",
    customerTypes: [],
    primaryMarkets: [],
    businessModel: null,
    companySizeContext: null,
    hiringSignals: [],
    riskSignals: [],
    researchSources: [],
    updatedAt: new Date(),
  },
  persona: {
    id: "persona",
    name: "Hiring Manager",
    suggestionKey: "hiring_manager",
    likelyTitles: ["VP"],
    profileJson: { narrative: { unused: "blob" } },
  },
  hiringManagerPersonaId: null,
  hiringManagerContactName: null,
  assessments: [],
  approvedStatements: [],
  stories: [],
  voiceSamples: [],
  sources: [],
  seekerAnswers: [],
} as never;

describe("Resume page live update, draft order, and cover letter writing", () => {
  it("ITEM 1: assets focus mounts WorkspaceJobRefresh so completed RESUME/COVER_LETTER jobs clear generating without a manual refresh", () => {
    const workspace = src("src/components/ApplicationWorkspace.tsx");
    const assetsFocus = workspace.slice(
      workspace.indexOf('showFocus(focus, ["assets"])'),
      workspace.indexOf('showFocus(focus, ["outreach"])') >= 0
        ? workspace.indexOf('showFocus(focus, ["outreach"])')
        : workspace.length,
    );
    expect(assetsFocus).toContain("WorkspaceJobRefresh");
    expect(assetsFocus).toContain("initialSignature={live.signature}");
    expect(assetsFocus).toContain('type="RESUME"');
    expect(assetsFocus).toContain('type="COVER_LETTER"');
    expect(assetsFocus).toContain("WorkspaceProgress");

    const live = src("src/components/ApplicationWorkspaceLive.tsx");
    expect(live).toContain("export function WorkspaceJobRefresh");
    expect(live).toContain("router.refresh()");
    expect(live).toContain("latest.signature !== signature.current");
    expect(live).toContain('job.status === "FAILED"');
    expect(live).toContain("workspace-failed-");
    expect(live).toContain(
      'latest.status === "PENDING" || latest.status === "IN_PROGRESS"',
    );
  });

  it("ITEM 1: gated skip returns No Changes To Resume/Cover Letter without enqueueing a job", () => {
    const actions = src("src/app/actions/application-assets.ts");
    const generateFn = actions.slice(
      actions.indexOf("export async function generateApplicationAssetAction"),
      actions.indexOf("export async function approveApplicationAssetAction"),
    );
    expect(generateFn).toContain("applicationAssetGenerateWouldSkip");
    expect(generateFn).toContain("unchangedResume");
    expect(generateFn).toContain("unchangedCoverLetter");
    expect(generateFn).toContain("enqueueApplicationJob");
    const skipReturn = generateFn.indexOf("applicationAssetGenerateWouldSkip");
    const enqueue = generateFn.indexOf("enqueueApplicationJob");
    expect(skipReturn).toBeGreaterThan(-1);
    expect(enqueue).toBeGreaterThan(skipReturn);
    expect(applicationAssetConfig.labels.unchangedResume).toBe(
      "No Changes To Resume",
    );
    expect(applicationAssetConfig.labels.unchangedCoverLetter).toBe(
      "No Changes To Cover Letter",
    );
    const section = src("src/components/ApplicationAssetsSection.tsx");
    expect(section).toContain("unchangedResume");
    expect(section).toContain("unchangedCoverLetter");
  });

  it("ITEM 2: regenerate instruction is in generation messages and fingerprint; a new instruction changes the fingerprint", () => {
    const prompt = src("src/lib/application-assets/prompt.ts");
    expect(prompt).toContain("regenerationInstruction: input.regenerationInstruction");
    const paid = src("src/lib/application-assets/paid-inputs.ts");
    expect(paid).toContain("regenerationInstruction: input.regenerationInstruction");
    const service = src("src/lib/application-assets/service.ts");
    expect(service).toContain(
      "regenerationInstruction: input.regenerationInstruction ?? null",
    );
    const actions = src("src/app/actions/application-assets.ts");
    expect(actions).toContain("regenerationInstruction");
    expect(actions).toContain("applicationAssetGenerateWouldSkip");

    const without = resumeAssetFingerprint({
      context: minimalResumeContext,
      hiddenRoleIds: [],
      condensedRoleIds: [],
      regenerationInstruction: null,
      qualityFeedback: [],
    });
    const withInstruction = resumeAssetFingerprint({
      context: minimalResumeContext,
      hiddenRoleIds: [],
      condensedRoleIds: [],
      regenerationInstruction:
        'Change the section heading "Earlier Sales Leadership Experience" to "Earlier Sales and Leadership Experience".',
      qualityFeedback: [],
    });
    const withOtherInstruction = assetGenerationFingerprint({
      context: minimalResumeContext,
      type: "RESUME",
      hiddenRoleIds: [],
      condensedRoleIds: [],
      salutation: "Dear Hiring Manager,",
      regenerationInstruction: "tighten the summary",
      qualityFeedback: [],
    });
    expect(without).not.toBe(withInstruction);
    expect(withInstruction).not.toBe(withOtherInstruction);
    expect(withInstruction).toMatch(/^[a-f0-9]{64}$/);
  });

  it("ITEM 2: earlierExperienceHeading comes from the presentation plan, not resume content", () => {
    const section = src("src/components/ApplicationAssetsSection.tsx");
    expect(section).toContain("earlierExperienceHeading");
    expect(section).toContain(
      'plan?.plan.type === "RESUME" ? plan.plan.earlierExperienceHeading',
    );
    const contract = src("src/lib/application-assets/contract.ts");
    expect(contract).not.toContain("earlierExperienceHeading");
    const planContract = src("src/lib/application-assets/plan-contract.ts");
    expect(planContract).toContain("earlierExperienceHeading");
  });

  it("ITEM 3: AssetHistory and AssetTypePanel list versions newest first", () => {
    const section = src("src/components/ApplicationAssetsSection.tsx");
    expect(section).toContain("sortAssetsNewestFirst");
    expect(section).toContain("b.version - a.version");
    expect(section).toContain("const orderedRows = sortAssetsNewestFirst(rows)");
    expect(section).toContain("data-testid=\"asset-version-history\"");
    const workspace = src("src/components/ApplicationWorkspace.tsx");
    expect(workspace).toContain('orderBy: [{ type: "asc" }, { version: "desc" }]');
  });

  it("ITEM 4: Harper shows New draft above the approved answer with Approve and Edit", () => {
    const thread = src("src/components/ConsultationThread.tsx");
    const resultStart = thread.indexOf("{hasResult && !item.ignored ? (");
    expect(resultStart).toBeGreaterThan(-1);
    const resultBlock = thread.slice(resultStart, resultStart + 1800);
    const pendingIdx = resultBlock.indexOf("consultation-pending-draft");
    const talkingIdx = resultBlock.indexOf("item.talkingPoint ? <ResultBody");
    const resumeIdx = resultBlock.indexOf("item.resumeBullet ? <ResultBody");
    expect(pendingIdx).toBeGreaterThan(-1);
    expect(talkingIdx).toBeGreaterThan(pendingIdx);
    expect(resumeIdx).toBeGreaterThan(pendingIdx);
    expect(resultBlock).toContain("consultationConversationCopy.newDraft");
    expect(resultBlock).toContain("<ResultActions");
    expect(consultationConversationCopy.newDraft).toBe("New draft");
    expect(consultationStatementLabels.APPROVED).toBe("Approved");
  });

  it("ITEM 5: cover letter instructions include the exact variation text and version is 16", () => {
    expect(COVER_LETTER_ASSET_INSTRUCTIONS).toContain(COVER_LETTER_VARIATION_TEXT);
    expect(COVER_LETTER_ASSET_PROMPT_VERSION).toBe("16");
  });

  it("rendering paths make no paid call and enqueue no job", () => {
    const workspace = src("src/components/ApplicationWorkspace.tsx");
    const section = src("src/components/ApplicationAssetsSection.tsx");
    const thread = src("src/components/ConsultationThread.tsx");
    const live = src("src/components/ApplicationWorkspaceLive.tsx");
    for (const file of [workspace, section, thread, live]) {
      expect(file).not.toMatch(
        /enqueueApplicationJob|generateStructured|runPaidStructuredCall/,
      );
    }
  });
});

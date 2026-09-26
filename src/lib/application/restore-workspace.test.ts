import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildHarperSuggestions } from "@/lib/application/harper-suggestions";
import { readLineList } from "@/lib/application/form-fields";
import {
  applicationStepList,
  applicationWorkspaceCopy,
} from "@/lib/product-config";
import {
  contrastRatio,
  designTokens,
  WCAG_AA_NORMAL_TEXT,
} from "@/lib/product-config/design-tokens";

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "generated") continue;
      walk(full, acc);
      continue;
    }
    if ((full.endsWith(".ts") || full.endsWith(".tsx")) && !full.includes(".test.")) {
      acc.push(full);
    }
  }
  return acc;
}

describe("restored workspace editing and Harper", () => {
  it("lets the seeker edit company information and job requirements", () => {
    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    const company = readFileSync(
      "src/components/ApplicationCompanyUpdateForm.tsx",
      "utf8",
    );
    const job = readFileSync(
      "src/components/ApplicationJobRequirementForm.tsx",
      "utf8",
    );
    const actions = readFileSync("src/app/actions/application.ts", "utf8");
    expect(workspace).toContain("ApplicationCompanyUpdateForm");
    expect(workspace).toContain("ApplicationJobRequirementForm");
    expect(company).toContain("company-update-form");
    expect(company).toContain("updateApplicationCompanyInformationAction");
    expect(job).toContain("job-requirement-edit-form");
    expect(job).toContain("updateApplicationJobRequirementAction");
    expect(actions).toContain("updateApplicationCompanyInformation");
    expect(actions).toContain("updateApplicationJobRequirement");
    const empty = new FormData();
    expect(readLineList(empty, "missing")).toEqual([]);
    const data = new FormData();
    data.set("responsibilities", "Own pipeline\n\nCoach managers");
    expect(readLineList(data, "responsibilities")).toEqual([
      "Own pipeline",
      "Coach managers",
    ]);
  });

  it("keeps Harper reply, polished-statement actions, and suggestions on the Harper page", () => {
    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    expect(thread).toContain("replyConsultationAction");
    expect(thread).toContain("consultation-reply");
    expect(thread).toContain("useConsultationResultAction");
    expect(thread).toContain("reviseConsultationResultAction");
    expect(thread).toContain("flagConsultationInaccuracyAction");
    expect(thread).toContain("consultationConversationCopy.useThis");
    expect(thread).toContain("consultationConversationCopy.changeSomething");
    expect(thread).toContain("consultationConversationCopy.notAccurate");
    expect(thread).toContain("showYourReplies");
    expect(thread).toContain("seekerSpeaker");
    expect(thread).toContain("toggle-seeker-replies");
    expect(thread).toContain('turn.speaker === "SEEKER"');
    expect(section).toContain("HarperSuggestionList");
    const suggestions = buildHarperSuggestions({
      campaignId: "camp_1",
      step: "consultation",
      productId: "prod_1",
      facts: {
        researchDone: true,
        researchFailed: false,
        researchInProgress: false,
        hasJobTitle: true,
        fitNeedsRescore: false,
        hiringTeamRoleCount: 1,
        hasApprovedResume: true,
        hasApprovedCoverLetter: true,
        contactCount: 1,
        interviewStageCount: 1,
        cheatSheetReady: false,
        appliedAt: null,
        consultationStarted: true,
      },
      people: [],
    });
    expect(suggestions.some((item) => item.type === "review_resume")).toBe(true);
    expect(suggestions.some((item) => item.type === "review_job")).toBe(true);
    expect(suggestions.some((item) => item.type === "open_profile")).toBe(true);
    expect(suggestions.some((item) => item.type === "start_consultation")).toBe(
      false,
    );
  });

  it("renders no claim flags anywhere in source", () => {
    const files = walk("src");
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (
        source.includes("ClaimFlagBanner") ||
        source.includes("claimFlagsJson") ||
        source.includes("isn't in your materials")
      ) {
        offenders.push(file.replace(/\\/g, "/"));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("uses navy side navigation with white buttons and AA contrast", () => {
    const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");
    const tracker = readFileSync(
      "src/components/ApplicationSidebarTracker.tsx",
      "utf8",
    );
    expect(sidebar).toContain("bg-nav");
    expect(sidebar).toContain("text-on-nav");
    expect(sidebar).toContain("bg-surface text-ink");
    expect(tracker).toContain("bg-surface text-ink");
    expect(tracker).toContain("{step.number}. {step.title}");
    expect(tracker).toContain("bg-success");
    expect(tracker).toContain("bg-warning-tint");
    expect(tracker).toContain("bg-danger");
    expect(designTokens.color.nav).toBe("#163A7A");
    expect(
      contrastRatio(designTokens.color.onNav, designTokens.color.nav),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(
      contrastRatio(designTokens.color.ink, designTokens.color.surface),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("puts application date and status first in the list and on the overview", () => {
    expect(applicationStepList[0]?.key).toBe("applied");
    expect(applicationStepList[0]?.number).toBe(1);
    expect(applicationStepList[0]?.title).toBe(
      applicationWorkspaceCopy.appliedTitle,
    );
    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    expect(workspace.indexOf("application-applied-wrap")).toBeLessThan(
      workspace.indexOf("application-next-step"),
    );
  });
});

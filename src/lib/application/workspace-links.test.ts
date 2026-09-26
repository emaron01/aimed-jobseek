import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CAMPAIGN_STAGE_KEYS } from "@/lib/workflow/campaign-stages";
import {
  listWorkspaceHrefs,
  WORKSPACE_CARD_WRAP_CLASS,
  WORKSPACE_MESSAGE_WRAP_CLASS,
  workspaceConsultationHref,
  workspaceProfileHref,
} from "@/lib/application/workspace-links";
import { workspaceSectionId } from "@/lib/product-config";

const LEGACY_STAGE_KEYS = ["send"] as const;

function walkAppFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkAppFiles(full, acc);
      continue;
    }
    if (entry.name === "page.tsx" || entry.name === "route.ts") acc.push(full);
  }
  return acc;
}

function appRoutePatterns(): Array<{ file: string; pattern: string }> {
  return walkAppFiles("src/app").map((file) => {
    const normalized = file.replace(/\\/g, "/");
    const pattern =
      normalized
        .replace(/^src\/app/, "")
        .replace(/\/page\.tsx$/, "")
        .replace(/\/route\.ts$/, "")
        .replace(/\/\([^/]+\)/g, "")
        .replace(/\[([^\]]+)\]/g, ":$1") || "/";
    return { file: normalized, pattern };
  });
}

function matchPath(
  pathname: string,
  pattern: string,
): Record<string, string> | null {
  const pathParts = pathname.split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);
  if (pathParts.length !== patternParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const part = patternParts[i];
    if (part.startsWith(":")) {
      params[part.slice(1)] = pathParts[i];
    } else if (part !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

function workspaceHrefResolves(href: string): boolean {
  const hashIndex = href.indexOf("#");
  const pathname = (hashIndex === -1 ? href : href.slice(0, hashIndex)) || "";
  const hash = hashIndex === -1 ? "" : href.slice(hashIndex + 1);
  if (!pathname) {
    const known = new Set([
      workspaceSectionId("CONSULTATION"),
      workspaceSectionId("HIRING_TEAM_IDENTIFY"),
      workspaceSectionId("RESUME"),
      workspaceSectionId("OUTREACH"),
      workspaceSectionId("INTERVIEW_GUIDE"),
      workspaceSectionId("APPLICATION_SUMMARY"),
      workspaceSectionId("NEXT_STEP"),
      workspaceSectionId("RESEARCH"),
    ]);
    return known.has(hash);
  }
  if (/^https?:\/\//i.test(pathname)) {
    try {
      return Boolean(new URL(pathname).hostname);
    } catch {
      return false;
    }
  }
  const matches = appRoutePatterns()
    .map((route) => ({ ...route, params: matchPath(pathname, route.pattern) }))
    .filter((route) => route.params);
  if (matches.length === 0) return false;
  const dedicated = matches.filter((route) => !route.file.includes("[stage]"));
  if (dedicated.length > 0) return true;
  const stage = matches[0]?.params?.stage;
  if (!stage) return false;
  return (
    CAMPAIGN_STAGE_KEYS.includes(stage as (typeof CAMPAIGN_STAGE_KEYS)[number]) ||
    LEGACY_STAGE_KEYS.includes(stage as (typeof LEGACY_STAGE_KEYS)[number])
  );
}

describe("workspace links", () => {
  it("resolves every workspace href to an existing route", () => {
    const hrefs = listWorkspaceHrefs({
      campaignId: "camp_1",
      productId: "prod_1",
      assetId: "asset_1",
      interviewStageId: "stage_1",
    });
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(workspaceHrefResolves(href), href).toBe(true);
    }
    expect(workspaceProfileHref("prod_1")).toBe("/setup/prod_1");
    expect(workspaceConsultationHref()).toBe("#consultation");
    expect(workspaceHrefResolves("/products/prod_1")).toBe(false);
    expect(workspaceHrefResolves("/campaigns/camp_1/consultation")).toBe(false);
  });

  it("uses the shared href helpers in workspace components", () => {
    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    const live = readFileSync(
      "src/components/ApplicationWorkspaceLive.tsx",
      "utf8",
    );
    const assets = readFileSync(
      "src/components/ApplicationAssetsSection.tsx",
      "utf8",
    );
    const interview = readFileSync(
      "src/components/InterviewStagesSection.tsx",
      "utf8",
    );
    const outreach = readFileSync(
      "src/components/ApplicationOutreachSections.tsx",
      "utf8",
    );
    const joined = [workspace, live, assets, interview, outreach].join("\n");
    expect(workspace).toContain("workspaceProfileHref");
    expect(workspace).toContain("workspaceCampaignSummaryHref");
    expect(live).toContain("workspaceConsultationHref");
    expect(assets).toContain("workspaceConsultationHref");
    expect(assets).toContain("workspaceAssetDocxHref");
    expect(interview).toContain("workspaceInterviewStageHref");
    expect(outreach).toContain("workspaceAssetDocxHref");
    expect(joined).not.toMatch(/`\/products\/\$\{/);
    expect(joined).not.toMatch(/\/campaigns\/\$\{[^}]+\}#consultation/);
  });
});

describe("workspace message wrap", () => {
  it("keeps card and message text inside the container", () => {
    expect(WORKSPACE_CARD_WRAP_CLASS).toContain("min-w-0");
    expect(WORKSPACE_CARD_WRAP_CLASS).toContain("max-w-full");
    expect(WORKSPACE_CARD_WRAP_CLASS).toContain("overflow-x-hidden");
    expect(WORKSPACE_MESSAGE_WRAP_CLASS).toContain("break-words");
    expect(WORKSPACE_MESSAGE_WRAP_CLASS).toContain("[overflow-wrap:anywhere]");
    const sources = [
      "src/components/ApplicationWorkspaceLive.tsx",
      "src/components/ApplicationWorkspace.tsx",
      "src/components/ApplicationAssetsSection.tsx",
      "src/components/ConsultationSection.tsx",
    ].map((file) => readFileSync(file, "utf8"));
    for (const source of sources) {
      expect(source).toContain("WORKSPACE_MESSAGE_WRAP_CLASS");
      expect(source).toContain("WORKSPACE_CARD_WRAP_CLASS");
    }
  });
});

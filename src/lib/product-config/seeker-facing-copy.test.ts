import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applicationAssetConfig,
  applicationResearchCopy,
  applicationStepCopy,
  applicationSummaryConfig,
  applicationWorkspaceCopy,
  candidateProfileEditCopy,
  consultationConversationCopy,
  criterionFlags,
  hiringTeamConfig,
  outreachConfig,
  polishCopy,
  seekerFacingForbiddenPatterns,
  workspaceJobCopy,
} from "@/lib/product-config";

const ROOT = join(process.cwd(), "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === "node_modules" || name === "generated") continue;
      out.push(...walk(path));
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      out.push(path);
    }
  }
  return out;
}

function collectStrings(value: unknown, path: string, out: Array<{ path: string; text: string }>) {
  if (typeof value === "string") {
    out.push({ path, text: value });
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    collectStrings(child, `${path}.${key}`, out);
  }
}

describe("seeker-facing copy", () => {
  it("keeps product-config chrome free of internal terms", () => {
    const strings: Array<{ path: string; text: string }> = [];
    collectStrings(applicationWorkspaceCopy, "applicationWorkspaceCopy", strings);
    collectStrings(applicationResearchCopy, "applicationResearchCopy", strings);
    collectStrings(applicationStepCopy, "applicationStepCopy", strings);
    collectStrings(applicationAssetConfig.labels, "applicationAssetConfig.labels", strings);
    collectStrings(applicationSummaryConfig, "applicationSummaryConfig", strings);
    collectStrings(consultationConversationCopy, "consultationConversationCopy", strings);
    collectStrings(criterionFlags, "criterionFlags", strings);
    collectStrings(hiringTeamConfig, "hiringTeamConfig", strings);
    collectStrings(outreachConfig.labels, "outreachConfig.labels", strings);
    collectStrings(candidateProfileEditCopy, "candidateProfileEditCopy", strings);
    collectStrings(polishCopy, "polishCopy", strings);
    collectStrings(workspaceJobCopy, "workspaceJobCopy", strings);

    const offenders: string[] = [];
    for (const item of strings) {
      for (const rule of seekerFacingForbiddenPatterns) {
        if (rule.pattern.test(item.text)) {
          offenders.push(`${item.path}: ${rule.name} in "${item.text}"`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("uses sentence-case workspace step titles", () => {
    expect(applicationWorkspaceCopy.nextStepTitle).toBe(
      applicationWorkspaceCopy.nextStepTitle.toLowerCase() ===
        applicationWorkspaceCopy.nextStepTitle
        ? applicationWorkspaceCopy.nextStepTitle
        : applicationWorkspaceCopy.nextStepTitle,
    );
    expect(applicationWorkspaceCopy.jobRequirementTitle.startsWith("Review and edit")).toBe(
      true,
    );
    expect(applicationWorkspaceCopy.hiringTeamTitle).toBe(
      "Review Hiring Personas – Add Who Will Be Interviewing",
    );
    expect(applicationSummaryConfig.title).toBe("Interview cheat sheet");
    expect(applicationAssetConfig.labels.sectionTitle).toBe("Resume and cover letter");
  });

  it("uses Generate for AI output actions", () => {
    expect(applicationAssetConfig.labels.generate).toBe(polishCopy.generate);
    expect(outreachConfig.labels.generate).toBe(polishCopy.generate);
    expect(hiringTeamConfig.actions.build.toLowerCase()).toContain("generate");
    expect(outreachConfig.labels.buildIndividual.toLowerCase()).toContain("generate");
  });

  it("does not render raw INFERENCE in seeker components", () => {
    const offenders: string[] = [];
    for (const abs of walk(join(ROOT, "components"))) {
      const rel = relative(ROOT, abs).replace(/\\/g, "/");
      if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
      const source = readFileSync(abs, "utf8");
      if (/>\s*INFERENCE\s*</.test(source) || /\{kind\}/.test(source) && source.includes('kind === "INFERENCE"')) {
        if (source.includes("{kind}") && !source.includes("criterionFlags")) {
          offenders.push(rel);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applicationWorkspaceCopy, polishCopy } from "@/lib/product-config";
import { RESEARCH_PROMPT_VERSION } from "@/lib/research/config";
import { COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content";
import { buildCompanyResearchMessages } from "@/lib/research/prompt";
import {
  appendSeekerSuppliedResearchEvidence,
  SEEKER_SUPPLIED_RESEARCH_SOURCE_URL,
} from "@/lib/research/seeker-supplied-notes";
import type { RetrievedEvidenceBundle } from "@/lib/research/sources";

function sourceFiles() {
  return {
    workspace: readFileSync("src/components/ApplicationWorkspace.tsx", "utf8"),
    briefing: readFileSync(
      "src/components/ApplicationCompanyBriefing.tsx",
      "utf8",
    ),
    status: readFileSync(
      "src/components/ApplicationResearchStatus.tsx",
      "utf8",
    ),
    actions: readFileSync("src/app/actions/application.ts", "utf8"),
    service: readFileSync("src/lib/application/service.ts", "utf8"),
    runs: readFileSync("src/lib/research/runs-service.ts", "utf8"),
    provider: readFileSync("src/lib/research/provider.ts", "utf8"),
    prompt: readFileSync("src/lib/prompt-content/company-research.ts", "utf8"),
  };
}

describe("application Company page briefing", () => {
  it("uses the briefing layout with sources and citations", () => {
    const { workspace, briefing } = sourceFiles();
    expect(workspace).toContain("ApplicationCompanyBriefing");
    expect(workspace).toContain('showFocus(focus, ["company"])');
    expect(briefing).toContain('data-testid="application-company-briefing"');
    expect(briefing).toContain("company-source-lead");
    expect(briefing).toContain("ResearchSourcesAppendix");
    expect(briefing).toContain("sourcesSupportingField");
    expect(briefing).toContain("sourcesSupportingClaim");
    expect(briefing).toContain("applicationWorkspaceCopy.whatTheyDoTitle");
    expect(briefing).toContain("formatCompanyBriefingMeta");
    expect(workspace).toContain("lastResearched");
    expect(applicationWorkspaceCopy.whatTheyDoTitle).toBe("What they do");
  });

  it("does not render Estimated AOV, AOV reasoning, or Buying signals", () => {
    const { workspace, briefing } = sourceFiles();
    expect(briefing).not.toContain("estimatedAov");
    expect(briefing).not.toContain("aovReasoning");
    expect(briefing).not.toContain("buyingSignals");
    expect(briefing).not.toContain("Estimated AOV");
    expect(briefing).not.toContain("AOV reasoning");
    expect(briefing).not.toContain("Buying signals");
    expect(workspace).not.toContain("estimatedAov");
    expect(workspace).not.toContain("buyingSignals");
  });

  it("makes Regenerate the only company action and hides the edit form", () => {
    const { workspace, briefing, status } = sourceFiles();
    expect(workspace).not.toContain("ApplicationCompanyUpdateForm");
    expect(workspace).not.toContain("Products:");
    expect(briefing).toContain("polishCopy.regenerate");
    expect(briefing).toContain('testId="regenerate-company-research"');
    expect(briefing).not.toContain("ApplicationCompanyUpdateForm");
    expect(briefing).not.toContain("company-update-form");
    expect(status).toContain("hideRetry");
    expect(workspace).toContain("hideRetry");
    expect(polishCopy.regenerate).toBe("Regenerate");
  });

  it("saves pasted notes and includes them as a source on Regenerate", () => {
    const { briefing, actions, service, runs, provider } = sourceFiles();
    expect(briefing).toContain('data-testid="company-research-notes"');
    expect(briefing).toContain("<details");
    expect(briefing).toContain("saveApplicationCompanyResearchNotesAction");
    expect(briefing).toContain('name="notes"');
    expect(actions).toContain("saveApplicationCompanyResearchNotes");
    expect(actions).toContain("formData.has(\"notes\")");
    expect(service).toContain("companyResearchNotes");
    expect(service).toContain("saveApplicationCompanyResearchNotes");
    expect(runs).toContain("companyResearchNotes");
    expect(runs).toContain("seekerSuppliedNotes");
    expect(provider).toContain("appendSeekerSuppliedResearchEvidence");
    expect(provider).toContain("input.seekerSuppliedNotes");
  });
});

describe("seeker-supplied research notes", () => {
  it("adds pasted text as a citable evidence source", () => {
    const empty: RetrievedEvidenceBundle = { sources: [], excerpts: [] };
    const withNotes = appendSeekerSuppliedResearchEvidence(
      empty,
      "They also run a managed filing service.",
    );
    expect(withNotes.sources).toEqual([
      expect.objectContaining({
        url: SEEKER_SUPPLIED_RESEARCH_SOURCE_URL,
        title: applicationWorkspaceCopy.companyNotesSourceTitle,
        sourceType: "OTHER",
        supports: ["whatTheySell", "companySummary"],
      }),
    ]);
    expect(withNotes.excerpts[0]?.text).toBe(
      "They also run a managed filing service.",
    );
    expect(appendSeekerSuppliedResearchEvidence(empty, "   ").sources).toEqual(
      [],
    );
  });
});

describe("company research prompt v4", () => {
  it("bumps the version and asks for detailed products and services", () => {
    expect(RESEARCH_PROMPT_VERSION).toBe("4");
    expect(COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS).toMatch(/What they do/i);
    expect(COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS).toMatch(
      /named offerings|services and products/i,
    );
    const { prompt } = sourceFiles();
    expect(prompt).toMatch(/as much detail as public evidence allows/);

    const messages = buildCompanyResearchMessages({
      company: {
        organizationId: "org_1",
        companyId: "co_1",
        name: "CSC",
        website: "https://www.cscglobal.com",
        normalizedDomain: "cscglobal.com",
        industry: null,
        employeeCount: null,
        location: null,
        seekerSuppliedNotes: "Interested in the governance suite.",
      },
      evidence: { sources: [], excerpts: [] },
      webSearchEnabled: true,
    });
    const user = JSON.parse(String(messages[1]?.content ?? "{}")) as {
      seekerSuppliedNotes: string | null;
      responseSchema: { whatTheySell: string };
      instruction: string;
    };
    expect(messages[0]?.content).toContain("Prompt version: 4");
    expect(user.seekerSuppliedNotes).toBe("Interested in the governance suite.");
    expect(user.responseSchema.whatTheySell).toMatch(/most important field/);
    expect(user.instruction).toMatch(/named services and products/);
  });
});

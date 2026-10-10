import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { paidCallResultJson } from "@/lib/ai/paid-call-gate";
import { workspaceWorkRunning } from "@/lib/application-jobs/workspace-status";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("paidCallResultJson", () => {
  it("drops an omitted optional field and keeps the rest", () => {
    const saved = paidCallResultJson({
      kept: "yes",
      optional: undefined,
      nested: { present: "ok", missing: undefined },
    });
    expect(saved).toEqual({ kept: "yes", nested: { present: "ok" } });
  });
});

describe("workspace refresher", () => {
  it("keeps refreshing while research is running and stops when nothing is", () => {
    expect(
      workspaceWorkRunning({
        jobs: [],
        researchPhase: "researching",
        posting: "ready",
      }),
    ).toBe(true);
    expect(
      workspaceWorkRunning({
        jobs: [],
        researchPhase: "queued",
        posting: "empty",
      }),
    ).toBe(true);
    expect(
      workspaceWorkRunning({
        jobs: [{ status: "PENDING" }],
        researchPhase: "not_started",
        posting: "ready",
      }),
    ).toBe(true);
    expect(
      workspaceWorkRunning({
        jobs: [],
        researchPhase: "not_started",
        posting: "processing",
      }),
    ).toBe(true);
    expect(
      workspaceWorkRunning({
        jobs: [{ status: "COMPLETED" }, { status: "FAILED" }],
        researchPhase: "ready",
        posting: "ready",
      }),
    ).toBe(false);
    const status = source("src/lib/application-jobs/workspace-status.ts");
    expect(status).not.toContain('session?.generationStatus === "GENERATING"');
    const live = source("src/components/ApplicationWorkspaceLive.tsx");
    expect(live).toContain("return latest.active");
    expect(live).toContain("initialWorkRunning");
  });
});

describe("Harper GENERATING flag", () => {
  it("clears a reply that returns or throws while the flag is still set", () => {
    const service = source("src/lib/consultation/service.ts");
    const start = service.indexOf("export async function processConsultationReply");
    const next = service.indexOf("\nfunction ", start + 1);
    const body = service.slice(start, next === -1 ? start + 40000 : next);
    expect(body).toContain("await failGeneration(session.id, message)");
    expect(body).toContain('current?.generationStatus === "GENERATING"');
    expect(body).toContain('generationStatus: "READY"');
  });
});

describe("parsed model JSON writes", () => {
  const files = [
    "src/lib/contact-profile/service.ts",
    "src/lib/application/research-finish.ts",
    "src/lib/application/service.ts",
    "src/lib/application-summary/service.ts",
    "src/lib/scoring/score-contact.ts",
    "src/lib/scoring/title-suggestions.ts",
    "src/lib/contact-research/service.ts",
    "src/lib/tenant/company-research-service.ts",
    "src/lib/consultation/service.ts",
    "src/lib/consultation/role-expertise.ts",
    "src/lib/application-assets/service.ts",
    "src/lib/application-assets/outreach.ts",
    "src/lib/application-assets/plan-service.ts",
    "src/lib/hiring-team/build.ts",
    "src/lib/hiring-team/synthesize-outcome.ts",
    "src/lib/persona-research/approve.ts",
    "src/lib/persona-research/synthesize.ts",
    "src/lib/persona-research/progressive-search.ts",
    "src/lib/persona-research/resynthesize-approved.ts",
    "src/lib/product-research/approve.ts",
    "src/lib/product-research/synthesize.ts",
    "src/lib/product-research/resynthesize-approved.ts",
    "src/lib/product-research/seeker-background.ts",
    "src/lib/product-research/acquire.ts",
    "src/lib/product-research/restore-role-dates.ts",
    "src/lib/product-research/restore-contact-details.ts",
    "src/lib/interpretation/persona.ts",
    "src/lib/interpretation/icp.ts",
    "src/lib/application-assets/resume-statement-picker-data.ts",
    "src/lib/application-assets/resume-bullet-candidate-service.ts",
  ];

  it("sends each affected write through paidCallResultJson", () => {
    for (const file of files) {
      expect(source(file), file).toContain("paidCallResultJson");
    }
  });
});

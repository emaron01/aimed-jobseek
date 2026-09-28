import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  HIRING_TEAM_TEMPORARY_COOLDOWN_MS,
  isHiringTeamIncompleteRecord,
  isPersonaDraftResultUsable,
  profileJsonAwaitingSeekerInput,
  readHiringTeamIncompleteSynthesize,
  recordHiringTeamIncompleteSynthesize,
} from "@/lib/hiring-team/synthesize-outcome";
import { isHiringTeamPersonaBuilt } from "@/lib/hiring-team/build";
import { isRetryableProviderMessage } from "@/lib/application-jobs/types";
import { hiringTeamConfig } from "@/lib/product-config";
import { assessHiringTeamDraft } from "@/lib/hiring-team/draft-quality";
import {
  cscExecutiveLeadershipDraftFields,
  cscExecutiveLeadershipWhyIdentified,
  cscSeniorDirectorSalesJobLines,
} from "@/lib/hiring-team/csc-executive-leadership-fixture";

const findUnique = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma-client", () => ({
  prisma: {
    paidCallReceipt: {
      findUnique,
      upsert,
    },
  },
}));

describe("hiring team build reliability", () => {
  beforeEach(() => {
    findUnique.mockReset();
    upsert.mockReset();
  });

  it("never renders modelNote to the seeker", () => {
    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    expect(workspace).not.toContain("narrative?.modelNote");
    expect(workspace).not.toMatch(/modelNote\s*\?\s*\(/);
  });

  it("shows the Add Interviewer Title / Persona form above Direct", () => {
    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    const formAt = workspace.indexOf('submitLabel="Add Interviewer Title / Persona"');
    const directAt = workspace.indexOf("hiringTeamConfig.sections.direct");
    expect(formAt).toBeGreaterThan(0);
    expect(directAt).toBeGreaterThan(formAt);
    expect(workspace).toContain('testId="add-hiring-team-role"');
    expect(workspace).toContain('name="likelyTitles"');
    expect(workspace).toContain('name="whyThisRoleMatters"');
  });

  it("maps status chips to the seeker-facing strings only", () => {
    expect(hiringTeamConfig.status.building).toBe("Building…");
    expect(hiringTeamConfig.status.stale).toBe(
      "Details changed: Regenerate to update",
    );
    expect(hiringTeamConfig.status.awaitingDetails).toBe(
      "Add more details to build this persona",
    );
    expect(hiringTeamConfig.status.approved).toBe("Approved");
    expect(hiringTeamConfig.status.built).toBe("");
    expect(hiringTeamConfig.status.identified).toBe("");
    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    expect(workspace).toContain("hiringTeamStatusChip");
    expect(workspace).toContain("AppPendingIndicator");
    expect(workspace).not.toContain("hiringTeamStatusLabel(");
  });

  it("does not count an edited role without narrative as built", () => {
    expect(
      isHiringTeamPersonaBuilt({
        setupStatus: "NEEDS_REVIEW",
        profileJson: { involvement: "DIRECT", narrative: null },
      }),
    ).toBe(false);
    expect(
      isHiringTeamPersonaBuilt({
        setupStatus: "NOT_STARTED",
        profileJson: {
          narrative: { overview: { text: "Owns fleet reliability.", kind: "FACT" } },
        },
      }),
    ).toBe(true);
  });

  it("treats incomplete synthesize receipts as not usable drafts", () => {
    expect(
      isPersonaDraftResultUsable({
        __hiringTeamSynthesizeOutcome: "INSUFFICIENT_INFORMATION",
        recordedAt: new Date().toISOString(),
      }),
    ).toBe(false);
    expect(isPersonaDraftResultUsable({ roleSummary: "ok" })).toBe(true);
  });

  it("blocks unpaid retry forever for insufficient information", async () => {
    const fingerprint = "fp-insufficient";
    const recordedAt = new Date(0).toISOString();
    findUnique.mockResolvedValue({
      inputHash: fingerprint,
      resultJson: {
        __hiringTeamSynthesizeOutcome: "INSUFFICIENT_INFORMATION",
        recordedAt,
      },
    });
    const blocked = await readHiringTeamIncompleteSynthesize({
      organizationId: "org",
      personaId: "persona",
      inputFingerprint: fingerprint,
      now: new Date("2099-01-01T00:00:00.000Z"),
    });
    expect(blocked?.blocksPaidCall).toBe(true);
    expect(blocked?.kind).toBe("INSUFFICIENT_INFORMATION");
  });

  it("blocks temporary exhausted retries for one hour then allows", async () => {
    const fingerprint = "fp-temp";
    const recordedAt = new Date("2026-01-01T00:00:00.000Z");
    findUnique.mockResolvedValue({
      inputHash: fingerprint,
      resultJson: {
        __hiringTeamSynthesizeOutcome: "TEMPORARY_EXHAUSTED",
        recordedAt: recordedAt.toISOString(),
      },
    });
    const within = await readHiringTeamIncompleteSynthesize({
      organizationId: "org",
      personaId: "persona",
      inputFingerprint: fingerprint,
      now: new Date(recordedAt.getTime() + HIRING_TEAM_TEMPORARY_COOLDOWN_MS - 1),
    });
    expect(within?.blocksPaidCall).toBe(true);
    expect(within?.kind).toBe("TEMPORARY_EXHAUSTED");
    const after = await readHiringTeamIncompleteSynthesize({
      organizationId: "org",
      personaId: "persona",
      inputFingerprint: fingerprint,
      now: new Date(recordedAt.getTime() + HIRING_TEAM_TEMPORARY_COOLDOWN_MS + 1),
    });
    expect(after?.blocksPaidCall).toBe(false);
  });

  it("records distinguishable incomplete outcomes", async () => {
    upsert.mockResolvedValue({});
    await recordHiringTeamIncompleteSynthesize({
      organizationId: "org",
      personaId: "p1",
      inputFingerprint: "hash",
      kind: "INSUFFICIENT_INFORMATION",
      reasons: ["Overview is missing."],
    });
    expect(upsert).toHaveBeenCalled();
    const payload = upsert.mock.calls[0]![0].create.resultJson;
    expect(isHiringTeamIncompleteRecord(payload)).toBe(true);
    expect(payload.__hiringTeamSynthesizeOutcome).toBe("INSUFFICIENT_INFORMATION");
  });

  it("detects awaitingSeekerInput on profileJson", () => {
    expect(profileJsonAwaitingSeekerInput({ awaitingSeekerInput: true })).toBe(
      true,
    );
    expect(profileJsonAwaitingSeekerInput({ narrative: null })).toBe(false);
  });

  it("retries timeout and rate-limit provider messages", () => {
    expect(isRetryableProviderMessage("Request timed out")).toBe(true);
    expect(isRetryableProviderMessage("rate limit exceeded")).toBe(true);
    expect(isRetryableProviderMessage("invalid schema")).toBe(false);
  });

  it("wires assessHiringTeamDraft into live synthesis with one rejection regenerate", () => {
    const ai = readFileSync("src/lib/hiring-team/ai.ts", "utf8");
    expect(ai).toContain("assessHiringTeamDraft");
    expect(ai).toContain("rejection = quality.reasons");
    expect(ai).toContain("attempt < 2");
    expect(ai).toContain("recordHiringTeamIncompleteSynthesize");
    expect(ai).toContain("RetryableHiringTeamProviderError");
  });

  it("queueHiringTeamBuild refuses missing persona AI configuration", () => {
    const build = readFileSync("src/lib/hiring-team/build.ts", "utf8");
    expect(build).toContain("isPersonaAiConfigured");
    expect(build).toContain(
      "Personas can't be built right now. Please try again shortly.",
    );
    expect(build).not.toContain(
      "Persona synthesis is not configured. This role shows its identification only",
    );
  });

  it("no HIRING_TEAM_BUILD starts without a seeker action caller", () => {
    const callers = [
      "src/app/actions/hiring-team.ts",
      "src/app/actions/application-summary.ts",
      "src/app/actions/application-outreach.ts",
    ];
    for (const file of callers) {
      expect(readFileSync(file, "utf8")).toContain("queueHiringTeamBuild");
    }
    const researchFinish = readFileSync(
      "src/lib/application/research-finish.ts",
      "utf8",
    );
    expect(researchFinish).toContain("HIRING_TEAM_IDENTIFY");
    expect(researchFinish).not.toContain("HIRING_TEAM_BUILD");
    expect(researchFinish).not.toContain("queueHiringTeamBuild");
  });

  it("hides hiring-team job system error panels", () => {
    const live = readFileSync(
      "src/components/ApplicationWorkspaceLive.tsx",
      "utf8",
    );
    expect(live).toContain('type === "HIRING_TEAM_BUILD"');
    expect(live).toContain("return null");
  });

  it("classifies a fixable assess rejection without treating it as built", () => {
    const result = assessHiringTeamDraft({
      involvement: "DIRECT",
      jobLines: ["Own production incidents on the motion service"],
      roleName: "Director",
      fields: {
        overview: "",
        pressures: [],
        impact: "",
        needs: [],
        concerns: [],
        interviewStage: null,
        evaluates: [],
        talkingPoints: [],
        communication: [],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.some((r) => /missing/i.test(r))).toBe(true);
    }
  });

  it("accepts the complete CSC Executive Leadership persona fixture", () => {
    expect(cscExecutiveLeadershipWhyIdentified.length).toBeGreaterThan(0);
    const result = assessHiringTeamDraft({
      fields: cscExecutiveLeadershipDraftFields,
      jobLines: [...cscSeniorDirectorSalesJobLines],
      involvement: "DIRECT",
      roleName: "Executive Leadership",
      likelyTitles: ["CRO", "VP Sales", "EVP Revenue"],
    });
    expect(result).toEqual({ ok: true });
  });

  it("queueHiringTeamBuild seeker message has no system language when unconfigured", () => {
    const message =
      "Personas can't be built right now. Please try again shortly.";
    const build = readFileSync("src/lib/hiring-team/build.ts", "utf8");
    expect(build).toContain(message);
    expect(message).not.toMatch(/configured|synthesis|provider|PERSONA_AI_/i);
  });

  it("detects missing persona AI configuration at web and worker startup without stopping", () => {
    const config = readFileSync("src/lib/ai/config.ts", "utf8");
    expect(config).toContain("export function assertPersonaAiConfigured");
    expect(config).toContain('event: "persona_ai_configuration_missing"');
    expect(config).toContain('severity: "operational"');
    const assertBody = config.slice(
      config.indexOf("export function assertPersonaAiConfigured"),
      config.indexOf("/** Fail closed for resume and cover-letter generation."),
    );
    expect(assertBody).toContain("console.error");
    expect(assertBody).toContain("if (isPersonaAiConfigured()) return");
    expect(assertBody).not.toContain("getPersonaAiConfig()");
    expect(assertBody).not.toMatch(/\bthrow\b/);
    const instrumentation = readFileSync("src/instrumentation.ts", "utf8");
    expect(instrumentation).toContain("assertPersonaAiConfigured");
    const worker = readFileSync("scripts/research-worker.ts", "utf8");
    expect(worker).toContain("assertPersonaAiConfigured");
  });

  it("temporary exhausted after worker retries marks awaiting without double-pay path", () => {
    const processSrc = readFileSync("src/lib/application-jobs/process.ts", "utf8");
    expect(processSrc).toContain("markHiringTeamBuildTemporaryExhausted");
    expect(processSrc).toContain('job.type === "HIRING_TEAM_BUILD"');
    const service = readFileSync("src/lib/application-jobs/service.ts", "utf8");
    expect(service).toContain("isRetryableProviderMessage");
    expect(service).toContain("HIRING_TEAM_BUILD");
    const actions = readFileSync("src/app/actions/hiring-team.ts", "utf8");
    expect(actions).toContain("No Changes To ${skip.roleName} Persona");
    expect(actions).toContain("skip.awaitingDetails");
    expect(actions).toContain("hiringTeamConfig.status.awaitingDetails");
  });

  it("edit clears awaitingSeekerInput so a new fingerprint can build", () => {
    const build = readFileSync("src/lib/hiring-team/build.ts", "utf8");
    expect(build).toContain("withAwaitingSeekerInput(persona.profileJson, false)");
    expect(build).toContain('manuallyEditedFields: ["seeker"]');
  });

  it("approve requires a built narrative", () => {
    const build = readFileSync("src/lib/hiring-team/build.ts", "utf8");
    expect(build).toContain(
      "Generate this ${vocab.persona.singular} before approving it.",
    );
    const workspace = readFileSync(
      "src/components/ApplicationWorkspace.tsx",
      "utf8",
    );
    expect(workspace).toContain("roleBuilt ? (");
    expect(workspace).toContain("approveApplicationRoleAction");
  });
});

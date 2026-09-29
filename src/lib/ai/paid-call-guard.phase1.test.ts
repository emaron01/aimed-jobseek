import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  fingerprintPaidCallInputs,
  runPaidStructuredCall,
} from "@/lib/ai/paid-call-gate";
import {
  hiringTeamIdentifyFingerprint,
  hiringTeamSynthesizeFingerprint,
  peerIdentityFromPersona,
} from "@/lib/hiring-team/paid-inputs";
import { HIRING_TEAM_IDENTIFICATION_PROMPT_VERSION } from "@/lib/hiring-team/contract";
import { PERSONA_SYNTHESIS_PROMPT_VERSION } from "@/lib/persona-research/contract";
import { hasTestDatabase } from "@/test/database";
import { prisma } from "@/lib/prisma-client";
import {
  claimNextApplicationJob,
  enqueueApplicationJob,
} from "@/lib/application-jobs/service";
import {
  hiringTeamSynthesizeUnchanged,
  rebuildApplicationHiringTeamRole,
  syncApplicationHiringTeam,
} from "@/lib/hiring-team/build";
import { identifyRolesWithModel } from "@/lib/hiring-team/ai";
import { NORMAL_JOB_MODEL } from "@/lib/job-requirement/fixtures";

const generateStructured = vi.hoisted(() => vi.fn());
const isPersonaAiConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isPersonaAiConfigured,
    getPersonaAiProvider: () => ({ generateStructured }),
  };
});

describe("paid-call gate Phase 1 fingerprints and wiring", () => {
  it("identify fingerprint is stable for the same evidence and versions", () => {
    const a = hiringTeamIdentifyFingerprint({
      evidence: [{ sourceId: "job", displayName: "Job", text: "Title: Eng" }],
    });
    const b = hiringTeamIdentifyFingerprint({
      evidence: [{ sourceId: "job", displayName: "Job", text: "Title: Eng" }],
    });
    expect(a).toBe(b);
    expect(a).toBe(
      fingerprintPaidCallInputs({
        promptVersion: HIRING_TEAM_IDENTIFICATION_PROMPT_VERSION,
        schemaName: "hiring_team_identification",
        evidence: [{ sourceId: "job", displayName: "Job", text: "Title: Eng" }],
      }),
    );
  });

  it("synthesize fingerprint uses sibling identity only (CHANGE 1)", () => {
    const base = {
      roleName: "Hiring Manager",
      likelyTitles: ["Director"],
      department: "Eng",
      whyThisRoleMatters: "Owns the hire",
      involvement: "DIRECT" as const,
      notes: null as string | null,
      rejection: [] as string[],
      excerpts: [{ sourceId: "job", displayName: "Job", text: "Title: Eng" }],
    };
    const withPeerA = hiringTeamSynthesizeFingerprint({
      ...base,
      peers: [
        {
          id: "p1",
          name: "Peer",
          likelyTitles: ["VP"],
          involvement: "INDIRECT",
        },
      ],
    });
    const withPeerB = hiringTeamSynthesizeFingerprint({
      ...base,
      peers: [
        {
          id: "p1",
          name: "Peer",
          likelyTitles: ["VP"],
          involvement: "INDIRECT",
        },
      ],
    });
    expect(withPeerA).toBe(withPeerB);
    expect(
      peerIdentityFromPersona({
        id: "p1",
        name: "Peer",
        targetTitles: ["VP"],
        profileJson: {
          involvement: "INDIRECT",
          narrative: { overview: { text: "changed wording" } },
        },
      }),
    ).toEqual({
      id: "p1",
      name: "Peer",
      likelyTitles: ["VP"],
      involvement: "INDIRECT",
    });
    expect(PERSONA_SYNTHESIS_PROMPT_VERSION).toBe("13");
  });

  it("Phase 1 gate stays on hiring-team; Phase 2 batch 1 adds job parse + shell", () => {
    const ai = readFileSync("src/lib/hiring-team/ai.ts", "utf8");
    expect(ai).toContain("runPaidStructuredCall");
    // Caching Phase 2 batch 1: job parse and cheat-sheet shell use the shared gate.
    expect(readFileSync("src/lib/job-requirement/parse.ts", "utf8")).toContain(
      "runPaidStructuredCall",
    );
    expect(
      readFileSync("src/lib/application-summary/shell-gate.ts", "utf8"),
    ).toContain("runPaidStructuredCall");
    for (const path of [
      "src/lib/consultation/ai.ts",
      "src/lib/application-assets/ai.ts",
      "src/lib/email-generation/service.ts",
      "src/lib/research/provider.ts",
    ]) {
      const src = readFileSync(path, "utf8");
      expect(src).not.toContain("runPaidStructuredCall");
      expect(src).not.toContain("paid-call-gate");
    }
    const actions = readFileSync("src/app/actions/hiring-team.ts", "utf8");
    expect(actions).toContain("No Changes To ${skip.roleName} Persona");
    expect(actions).toContain("hiringTeamSynthesizeUnchanged");
    const processSrc = readFileSync("src/lib/application-jobs/process.ts", "utf8");
    expect(processSrc).toContain("synthesizeSkipped");
    const noAi = readFileSync("src/lib/application/no-ai-on-view.test.ts", "utf8");
    expect(noAi).toContain("enqueueApplicationJob");
  });
});

describe.skipIf(!hasTestDatabase())("paid-call gate Phase 1 with database", () => {
  const suffix = `pcg-${Date.now()}`;
  let organizationId = "";
  let productId = "";
  let userId = "";
  let campaignId = "";

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `[TEST] PCG ${suffix}`, slug: `pcg-${suffix}` },
    });
    organizationId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `pcg-${suffix}@example.test`,
        emailNormalized: `pcg-${suffix}@example.test`,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: { organizationId, name: `PCG Product ${suffix}` },
    });
    productId = product.id;
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `PCG App ${suffix}`,
        productId,
      },
    });
    campaignId = campaign.id;
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId,
        rawText: "Senior Product Engineer",
        title: NORMAL_JOB_MODEL.title,
        companyName: NORMAL_JOB_MODEL.companyName,
        reportingLine: NORMAL_JOB_MODEL.reportingLine,
        responsibilities: NORMAL_JOB_MODEL.responsibilities,
        requiredItems: NORMAL_JOB_MODEL.requiredItems,
        preferredItems: NORMAL_JOB_MODEL.preferredItems,
        scorecardJson: NORMAL_JOB_MODEL.scorecard,
        employerDisposition: "UNDISCLOSED",
      },
    });
  });

  afterEach(() => {
    generateStructured.mockReset();
    isPersonaAiConfigured.mockReturnValue(true);
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
  });

  it("identify with unchanged evidence skips the second provider call", async () => {
    generateStructured.mockResolvedValue({
      data: {
        roles: [
          {
            name: "Hiring Manager",
            likelyTitles: ["Director of Engineering"],
            department: "Engineering",
            involvement: "DIRECT",
            whyInvolved: "Reports to this role",
            evidence: [{ claim: "Reports to: Director", kind: "FACT" }],
          },
        ],
      },
    });
    const evidence = [
      {
        sourceId: "job-requirement",
        sourceType: "JOB_REQUIREMENT",
        displayName: "Job requirement",
        text: "Title: Senior Engineer\nReports to: Director of Engineering",
      },
    ];
    const usage = {
      organizationId,
      campaignId,
      category: "PERSONA_RESEARCH" as const,
      operation: "HIRING_TEAM" as const,
    };
    const first = await identifyRolesWithModel({ evidence, usage });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.skipped).toBe(false);
    expect(generateStructured).toHaveBeenCalledTimes(1);
    const second = await identifyRolesWithModel({ evidence, usage });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.skipped).toBe(true);
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });

  it("receipt short-circuits a second call with the same fingerprint (crash/retry safety)", async () => {
    let calls = 0;
    const fingerprint = fingerprintPaidCallInputs({ probe: `retry-${suffix}` });
    await runPaidStructuredCall({
      organizationId,
      operation: "HIRING_TEAM_IDENTIFY",
      subjectKey: `${campaignId}-retry-probe`,
      inputFingerprint: fingerprint,
      parseStored: (raw) => raw as { ok: true },
      isResultUsable: (stored) => Boolean(stored && typeof stored === "object"),
      callProvider: async () => {
        calls += 1;
        return { ok: true as const };
      },
    });
    await runPaidStructuredCall({
      organizationId,
      operation: "HIRING_TEAM_IDENTIFY",
      subjectKey: `${campaignId}-retry-probe`,
      inputFingerprint: fingerprint,
      parseStored: (raw) => raw as { ok: true },
      isResultUsable: (stored) => Boolean(stored && typeof stored === "object"),
      callProvider: async () => {
        calls += 1;
        return { ok: true as const };
      },
    });
    expect(calls).toBe(1);
  });

  it("concurrent enqueues share one PENDING; serialized types get a follow-up while IN_PROGRESS", async () => {
    const [a, b] = await Promise.all([
      enqueueApplicationJob({ organizationId, campaignId, type: "NEXT_STEP" }),
      enqueueApplicationJob({ organizationId, campaignId, type: "NEXT_STEP" }),
    ]);
    expect(a.id).toBe(b.id);
    expect(
      await prisma.applicationJob.count({
        where: {
          organizationId,
          campaignId,
          type: "NEXT_STEP",
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
      }),
    ).toBe(1);

    await prisma.applicationJob.update({
      where: { id: a.id },
      data: { status: "IN_PROGRESS", startedAt: new Date(), workerHeartbeatAt: new Date() },
    });
    const followUp = await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "NEXT_STEP",
    });
    expect(followUp.id).not.toBe(a.id);
    expect(followUp.status).toBe("PENDING");

    const resume = await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "RESUME",
    });
    const resumeAgain = await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "RESUME",
    });
    expect(resumeAgain.id).toBe(resume.id);

    await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "COVER_LETTER",
    });
    const first = await claimNextApplicationJob();
    const second = await claimNextApplicationJob();
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it("built roles stay non-stale after identify with unchanged evidence (CHANGE 1)", async () => {
    generateStructured.mockResolvedValue({
      data: {
        roles: [
          {
            name: "Hiring Manager",
            likelyTitles: ["Director of Engineering"],
            department: "Engineering",
            involvement: "DIRECT",
            whyInvolved: "Reports to this role",
            evidence: [{ claim: "Reports to: Director", kind: "FACT" }],
          },
        ],
      },
    });
    await syncApplicationHiringTeam({ organizationId, campaignId });
    const role = await prisma.persona.findFirst({
      where: { organizationId, campaignId, archivedAt: null },
    });
    expect(role).toBeTruthy();
    generateStructured.mockResolvedValue({
      data: {
        personaDraft: {
          name: role!.name,
          roleSummary:
            "The Director of Engineering owns delivery of the warehouse robot fleet and the hiring bar.",
          impact: "This hire takes on-call load off the director.",
          needsFromHire: [
            "Own production incidents on the motion service.",
            "Raise the hiring bar for engineers who can ship fleet software.",
          ],
          candidateConcerns: [
            "They will doubt a candidate who has not owned a production service.",
          ],
          talkingPoints: [
            "Describe how you would sit with the reliability rotation.",
          ],
          communicationApproach: [
            "They want the work in the order it happened.",
          ],
          interviewStage: "hiring manager chronological walk-through",
          organizationalPressures: [
            "They are measured on fleet uptime and incident recovery.",
          ],
        },
      },
    });
    const rebuilt = await rebuildApplicationHiringTeamRole({
      organizationId,
      campaignId,
      personaId: role!.id,
    });
    expect(rebuilt.synthesizeSkipped).toBe(false);

    generateStructured.mockClear();
    generateStructured.mockResolvedValue({
      data: {
        roles: [
          {
            name: "Hiring Manager",
            likelyTitles: ["Director of Engineering"],
            department: "Engineering",
            involvement: "DIRECT",
            whyInvolved: "Reports to this role",
            evidence: [{ claim: "Reports to: Director", kind: "FACT" }],
          },
        ],
      },
    });
    await syncApplicationHiringTeam({ organizationId, campaignId });
    const after = await prisma.persona.findUnique({ where: { id: role!.id } });
    expect(after?.staleAt).toBeNull();

    const skipCheck = await hiringTeamSynthesizeUnchanged({
      organizationId,
      campaignId,
      personaId: role!.id,
    });
    expect(skipCheck.unchanged).toBe(true);
    expect(skipCheck.roleName).toBe(role!.name);

    const rebuildSkip = await rebuildApplicationHiringTeamRole({
      organizationId,
      campaignId,
      personaId: role!.id,
    });
    expect(rebuildSkip.synthesizeSkipped).toBe(true);
  });
});

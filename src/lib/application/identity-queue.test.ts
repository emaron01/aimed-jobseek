import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rejectedNextStep } from "@/lib/application/next-step";
import {
  applyFallbackFields,
  readEmployerCorrectionFields,
} from "@/lib/application/form-fields";
import { isTimeoutMessage } from "@/lib/application-jobs/types";
import { extractLinkedInFacts } from "@/lib/contact-profile/extract";
import { commonGroundFromProfiles } from "@/lib/contact-profile/common-ground";
import { emptyCandidateProfile } from "@/lib/product-research/candidate-profile";
import { employerIdentityCopy, consultationConfig } from "@/lib/product-config";
import { verifyEmployerIdentity } from "@/lib/job-requirement/identity-verification";
import { applicationResearchCopy } from "@/lib/product-config";
import { applicationResearchPhase, toApplicationResearchStatusView } from "@/lib/application/research-status";

describe("employer correction form fields", () => {
  it("reads the correction form values and aliases", () => {
    const formData = new FormData();
    formData.set("campaignId", "camp_1");
    formData.set("employerName", "CSC");
    formData.set("website", "https://www.cscglobal.com");
    expect(readEmployerCorrectionFields(formData)).toEqual({
      campaignId: "camp_1",
      employerName: "CSC",
      website: "https://www.cscglobal.com",
      companyId: "",
    });
    const aliases = new FormData();
    aliases.set("campaignId", "camp_1");
    aliases.set("companyName", "CSC");
    aliases.set("companyWebsite", "https://www.cscglobal.com");
    expect(readEmployerCorrectionFields(aliases).employerName).toBe("CSC");
    expect(readEmployerCorrectionFields(aliases).website).toBe(
      "https://www.cscglobal.com",
    );
  });

  it("fills empty FormData keys from live fallback values", () => {
    const formData = new FormData();
    formData.set("campaignId", "camp_1");
    applyFallbackFields(formData, {
      employerName: "CSC",
      website: "https://www.cscglobal.com",
    });
    expect(readEmployerCorrectionFields(formData).employerName).toBe("CSC");
  });

  it("wires the correction form and submits through the live form FormData", () => {
    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    const form = readFileSync("src/components/ApplicationActionForm.tsx", "utf8");
    const action = readFileSync("src/app/actions/application.ts", "utf8");
    expect(workspace).toContain('data-testid="application-contacts-wrap"');
    expect(workspace).toContain("applicationWorkspaceCopy.contactsTitle");
    expect(workspace).toContain("hiringTeamConfig.workspaceTitle");
    expect(workspace).toContain("applicationWorkspaceCopy.jobRequirementTitle");
    expect(workspace).toContain('testId="correct-employer-form"');
    expect(workspace).toContain('name="employerName"');
    expect(workspace).toContain('name="website"');
    expect(form).toContain("new FormData(form as HTMLFormElement)");
    expect(form).toContain("event.preventDefault()");
    expect(form).toContain("pending={pending}");
    expect(readFileSync("src/components/AppButton.tsx", "utf8")).toContain(
      "action-pending-spinner",
    );
    expect(form).not.toContain("useActionState");
    expect(action).toContain("readEmployerCorrectionFields");
  });
});

describe("employer identity verdict", () => {
  it("is MATCHED when website matches and size is not stated", () => {
    const verification = verifyEmployerIdentity({
      posting: {
        rawText:
          "Channel Partnerships Leader at CSC in Wilmington, Delaware. https://www.cscglobal.com",
        title: "Channel Partnerships Leader",
        companyName: "CSC",
        location: "Wilmington, Delaware",
        suppliedEmployerWebsite: "https://www.cscglobal.com",
      },
      research: {
        companyName: "CSC",
        companySummary:
          "CSC provides corporate solutions and domain services to businesses worldwide.",
        whatTheySell: "Corporate solutions and domain services.",
        businessModel: "B2B professional services.",
        companySizeContext: null,
        location: "Wilmington, Delaware",
        website: "https://www.cscglobal.com",
        identityAmbiguous: false,
        researchSources: [
          {
            url: "https://www.cscglobal.com/about",
            title: "About CSC",
            supports: ["Corporate solutions"],
          },
        ],
      },
    });
    expect(verification.checks.find((check) => check.key === "location")?.status).toBe(
      "MATCH",
    );
    expect(verification.checks.find((check) => check.key === "website")?.status).toBe(
      "MATCH",
    );
    expect(
      verification.checks.find((check) => check.key === "sizeOrStage")?.status,
    ).toBe("NOT_STATED");
    expect(verification.verdict).toBe("MATCHED");
  });

  it("never treats not stated as a mismatch", () => {
    expect(employerIdentityCopy.notStatedInResearch).toContain("Not stated");
  });
});

describe("employer research status", () => {
  it("shows completed research as Done even when identity is unconfirmed", () => {
    const phase = applicationResearchPhase({
      run: {
        status: "COMPLETED",
        createdAt: "2026-09-25T12:00:00.000Z",
        workerHeartbeatAt: "2026-09-25T12:02:00.000Z",
      },
      researchStatus: "COMPLETED",
    });
    expect(phase).toBe("done");
    expect(toApplicationResearchStatusView(phase, "run_1").label).toBe(
      applicationResearchCopy.done,
    );
    expect(toApplicationResearchStatusView(phase, "run_1").label).not.toBe(
      applicationResearchCopy.idle,
    );
    const statusSource = readFileSync(
      "src/lib/application/research-status.ts",
      "utf8",
    );
    expect(statusSource).not.toContain('employerDisposition !== "IDENTIFIED"');
  });
});

describe("hiring team queue", () => {
  it("identity save queues identification only and does not synthesize", () => {
    const service = readFileSync("src/lib/application/service.ts", "utf8");
    const build = readFileSync("src/lib/hiring-team/build.ts", "utf8");
    expect(service).toContain("queueHiringTeamIdentify");
    expect(service).not.toContain("syncApplicationHiringTeam");
    expect(build).toContain("queueHiringTeamBuild");
    expect(build).toContain("queueHiringTeamBuildDirect");
    expect(build).toMatch(/draftsFor\(/);
    const sync = build.slice(
      build.indexOf("export async function syncApplicationHiringTeam"),
      build.indexOf("export async function queueHiringTeamIdentify"),
    );
    expect(sync).not.toContain("draftsFor(");
  });

  it("retries timeouts then marks Failed", () => {
    expect(isTimeoutMessage("Hiring Team role Responses API timed out after 90000ms.")).toBe(
      true,
    );
    const jobs = readFileSync("src/lib/application-jobs/service.ts", "utf8");
    expect(jobs).toContain("isTimeoutMessage");
    expect(jobs).toContain("attempt < job.maxAttempts");
    expect(jobs).toContain('status: "FAILED"');
  });
});

describe("LinkedIn paste and common ground", () => {
  it("extracts FACT title and only exact overlaps", () => {
    const extracted = extractLinkedInFacts(`Alex Rivera
Director of Partnerships at Northwind
Experience
Director of Partnerships
Northwind · Full-time
Jan 2022 - Present
Education
University of Delaware
About
Channel partnerships
`);
    expect(extracted.currentTitle?.kind).toBe("FACT");
    expect(extracted.currentTitle?.text).toMatch(/Director of Partnerships/i);
    expect(extracted.currentTitle?.provenance[0]?.sourceId).toBe("linkedin-paste");
    const profile = emptyCandidateProfile();
    profile.experience.push({
      id: "exp_1",
      kind: "FACT",
      employer: "Northwind",
      title: "Director of Partnerships",
      startDate: null,
      endDate: null,
      location: null,
      summary: null,
      achievements: [],
      reasonForLeaving: null,
      provenance: [{ sourceId: "resume" }],
    });
    profile.education.push({
      id: "ed_1",
      kind: "FACT",
      text: "University of Delaware",
      provenance: [{ sourceId: "resume" }],
    });
    const overlaps = commonGroundFromProfiles({ extracted, profile });
    expect(overlaps.some((item) => item.text === "Northwind")).toBe(true);
    expect(overlaps.some((item) => item.text === "University of Delaware")).toBe(true);
    expect(overlaps.every((item) => item.seekerSource && item.contactSource)).toBe(
      true,
    );
  });
});

describe("next-step card quality", () => {
  it("rejects a scheduled consultation card and accepts starting Harper", () => {
    expect(
      rejectedNextStep(
        `Schedule your initial consultation with ${consultationConfig.displayName}.`,
        "consultation_not_started",
      ),
    ).toBe(true);
    expect(
      rejectedNextStep(
        `Start ${consultationConfig.displayName} in this workspace to review the job.`,
        "consultation_not_started",
      ),
    ).toBe(false);
  });
});

describe("generation paths move to the worker", () => {
  it("queues consultation, assets, outreach, guides, summary, and next step", () => {
    const consult = readFileSync("src/app/actions/consultation.ts", "utf8");
    const assets = readFileSync("src/app/actions/application-assets.ts", "utf8");
    const outreach = readFileSync("src/app/actions/application-outreach.ts", "utf8");
    const interview = readFileSync("src/app/actions/interview.ts", "utf8");
    const summary = readFileSync("src/app/actions/application-summary.ts", "utf8");
    const next = readFileSync("src/lib/application/next-step.ts", "utf8");
    expect(consult).toContain('type: "CONSULTATION"');
    expect(assets).toContain("enqueueApplicationJob");
    expect(outreach).toContain('type: "OUTREACH"');
    expect(interview).toContain('type: "INTERVIEW_GUIDE"');
    expect(summary).toContain('type: "APPLICATION_SUMMARY"');
    expect(next).toContain('type: "NEXT_STEP"');
    expect(next).toContain("enqueueApplicationJob");
  });
});

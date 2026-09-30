import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { interviewThankYouClarifyFingerprint } from "@/lib/interview/thank-you-paid-inputs";
import { cheatSheetPersonSectionInputHash } from "@/lib/application-summary/people";
import { assetClaimValidationFingerprint } from "@/lib/application-assets/paid-inputs";

function src(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function fingerprintFnBody(source: string, fnName: string): string {
  const start = source.indexOf(`function ${fnName}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nexport ", start + 1);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

describe("writing-on-luna — writing steps use consultation reply provider", () => {
  it("routes each writing step to getConsultationReplyAiProvider", () => {
    const assets = src("src/lib/application-assets/ai.ts");
    const interviewAi = src("src/lib/interview/ai.ts");
    const summaryAi = src("src/lib/application-summary/ai.ts");

    expect(assets).toMatch(
      /generateResumeWithModel[\s\S]*getConsultationReplyAiProvider/,
    );
    expect(assets).toMatch(
      /generateCoverLetterWithModel[\s\S]*getConsultationReplyAiProvider/,
    );
    expect(assets).toMatch(
      /generateOutreachWithModel[\s\S]*getConsultationReplyAiProvider/,
    );
    expect(interviewAi).toMatch(
      /generateInterviewThankYouClarifyingQuestions[\s\S]*getConsultationReplyAiProvider/,
    );
    expect(summaryAi).toMatch(
      /generateCheatSheetPersonSectionGuidance[\s\S]*getConsultationReplyAiProvider/,
    );
    expect(
      fingerprintFnBody(summaryAi, "generateCheatSheetPersonSectionGuidance"),
    ).not.toContain("getConsultationAiProvider");
  });

  it("leaves thinking and claim-validation providers unchanged", () => {
    const assets = src("src/lib/application-assets/ai.ts");
    const summaryAi = src("src/lib/application-summary/ai.ts");
    const planAi = src("src/lib/application-assets/plan-ai.ts");
    const consultationAi = src("src/lib/consultation/ai.ts");
    const offerValidation = src("src/lib/campaign/offer-validation.ts");
    const emailService = src("src/lib/email-generation/service.ts");

    expect(summaryAi).toMatch(
      /generateApplicationSummaryShell[\s\S]*getConsultationAiProvider/,
    );
    expect(planAi).toContain("getConsultationAiProvider");
    expect(consultationAi).toMatch(
      /planConsultationWithModel[\s\S]*getConsultationAiProvider/,
    );
    expect(assets).toMatch(/selectOutreachFacts[\s\S]*getEmailFactsAiProvider/);
    expect(assets).toMatch(
      /validateAssetClaimsWithModel[\s\S]*getAssetValidationAiProvider/,
    );
    expect(
      fingerprintFnBody(assets, "validateAssetClaimsWithModel"),
    ).not.toContain("getConsultationReplyAiProvider");
    expect(offerValidation).toContain("getEmailAiProvider");
    expect(emailService).toContain("getEmailAiProvider");
  });

  it("fingerprints for moved writing steps do not include model or provider", () => {
    const paid = src("src/lib/application-assets/paid-inputs.ts");
    const outreach = src("src/lib/application-assets/outreach-paid-inputs.ts");
    const thankYou = src("src/lib/interview/thank-you-paid-inputs.ts");
    const people = src("src/lib/application-summary/people.ts");

    for (const body of [
      fingerprintFnBody(paid, "resumeAssetFingerprint"),
      fingerprintFnBody(paid, "coverLetterAssetFingerprint"),
      fingerprintFnBody(outreach, "outreachAssetFingerprint"),
      fingerprintFnBody(thankYou, "interviewThankYouClarifyFingerprint"),
      fingerprintFnBody(people, "cheatSheetPersonSectionInputHash"),
    ]) {
      expect(body).not.toMatch(/\bmodel\b/);
      expect(body).not.toMatch(/\bprovider\b/);
    }

    expect(
      interviewThankYouClarifyFingerprint({
        notes: "Discussed roadmap",
        qualityFeedback: [],
      }),
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(
      assetClaimValidationFingerprint({
        claims: [],
        sources: [],
        assetType: "RESUME",
      }),
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(
      cheatSheetPersonSectionInputHash({
        person: {
          sectionKey: "contact:1",
          roleId: "role",
          contactId: "c1",
          heading: "Alex",
          roleName: "Hiring Manager",
          titles: ["Director"],
          sectionKind: "HIRING_MANAGER",
        },
        sources: [{ id: "s1", text: "note" }],
        careerStage: "mid_career",
      }),
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not regenerate on page view — render paths stay read-only for writing", () => {
    const workspace = src("src/components/ApplicationWorkspace.tsx");
    const summaryPage = src(
      "src/app/(app)/campaigns/[id]/summary/page.tsx",
    );
    expect(workspace).not.toContain("generateResumeWithModel");
    expect(workspace).not.toContain("generateCoverLetterWithModel");
    expect(workspace).not.toContain("generateOutreachWithModel");
    expect(workspace).not.toContain("generateCheatSheetPersonSectionGuidance");
    expect(workspace).not.toContain(
      "generateInterviewThankYouClarifyingQuestions",
    );
    expect(summaryPage).not.toContain("generateCheatSheetPersonSectionGuidance");
  });
});

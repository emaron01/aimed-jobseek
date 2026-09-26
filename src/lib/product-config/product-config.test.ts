import { describe, expect, it } from "vitest";
import {
  brand,
  countedNoun,
  criterionFlagLabels,
  criterionFlags,
  FEATURE_FLAGS,
  features,
  applicationAssetConfig,
  consultationConfig,
  applicationResearchCopy,
  applicationWorkspaceCopy,
  consultationConversationCopy,
  employerIdentityCopy,
  obsoleteWorkspaceFailurePhrases,
  hiringTeamConfig,
  outreachConfig,
  icpLabels,
  nounForCount,
  organizationNameFromSeeker,
  referralShareMessage,
  signupCopy,
  supportMailtoHref,
  vocab,
} from "@/lib/product-config";
import {
  assertBrandDeploymentConfig,
  BrandConfigError,
  getBrandDeployment,
} from "@/lib/product-config/deployment";

describe("vocabulary", () => {
  it("exposes typed noun forms used in the UI", () => {
    expect(vocab.campaign.singular).toBe("application");
    expect(vocab.campaign.Plural).toBe("Applications");
    expect(vocab.campaign.aSingular).toBe("an application");
    expect(vocab.icp.aSingular).toBe("a Target Employer profile");
    expect(vocab.icp.nav).toBe("Target Employers");
    expect(vocab.persona.singular).toBe("Hiring Team role");
    expect(vocab.persona.nav).toBe("Hiring Team");
    expect(vocab.product.nav).toBe("Personal Profile");
    expect(vocab.product.singular).toBe("Personal Profile");
    expect(vocab.prospect.plural).toBe("contacts");
    expect(vocab.account.singular).toBe("employer");
    expect(vocab.seeker.plural).toBe("job seekers");
    expect(nounForCount(1, vocab.contact)).toBe("contact");
    expect(countedNoun(3, vocab.contact)).toBe("3 contacts");
    expect(criterionFlags.required).toBe("Must-have");
    expect(criterionFlags.disqualifier).toBe("Deal-breaker");
    expect(criterionFlagLabels({ isRequired: true, isDisqualifier: true })).toEqual(
      ["Must-have", "Deal-breaker"],
    );
    expect(icpLabels.scoringCriteria).toBe("What you're looking for");
    expect(icpLabels.fromCompanyResearch).toBe("Checked against company research");
    expect(icpLabels.updateFromDescription).toBe("Update from my description");
    expect(organizationNameFromSeeker({ firstName: "Alex", lastName: "Chen" })).toBe(
      "Alex Chen's workspace",
    );
    expect(signupCopy.emailLabel).toBe("Email");
    expect(applicationResearchCopy.queued).toBe("Starting research…");
    expect(applicationResearchCopy.researching).toBe("Researching");
    expect(applicationResearchCopy.done).toBe("Done");
    expect(applicationResearchCopy.failed).toBe("Failed");
    expect(applicationResearchCopy.notStarted).toBe("Research has not started");
    expect(employerIdentityCopy.notStatedInPosting).toBe("Not stated in the posting");
    expect(employerIdentityCopy.checkLabels.sizeOrStage).toBe("Size or stage");
    expect(employerIdentityCopy.status.MATCH).toBe("Match");
    expect(employerIdentityCopy.reasonTemplates.industryCompare).toContain("{posting}");
    expect(applicationAssetConfig.coverLetter.omittedApprovedStatement).toContain(
      "approved consultation statements",
    );
    expect(applicationAssetConfig.coverLetter.missingStorySubstance).toContain(
      "personally did",
    );
    expect(applicationAssetConfig.coverLetter.thinEvidence).toContain("{consultant}");
    expect(consultationConfig.displayName).toBe("Harper");
    expect(consultationConversationCopy.planUnusable).toMatch(/could not plan/i);
    expect(obsoleteWorkspaceFailurePhrases).toContain(
      consultationConversationCopy.planUnusable,
    );
    expect(obsoleteWorkspaceFailurePhrases).toContain(
      applicationAssetConfig.labels.verificationFailed,
    );
    expect(obsoleteWorkspaceFailurePhrases).toContain("did not pass checks");
    expect(obsoleteWorkspaceFailurePhrases).toContain("not enough to save");
    expect(obsoleteWorkspaceFailurePhrases).toContain("could not be grounded");
    expect(applicationWorkspaceCopy.nextStepTitle).toBe(
      "Let's walk through this application",
    );
    expect(consultationConversationCopy.nextStepTitle).toBe(
      applicationWorkspaceCopy.nextStepTitle,
    );
    expect(applicationWorkspaceCopy.jobRequirementTitle).toBe(
      "Job requirements",
    );
    expect(hiringTeamConfig.workspaceTitle).toBe(
      "Review Hiring Personas – Add Who Will Be Interviewing",
    );
    expect(outreachConfig.labels.appliedTitle).toBe(
      "Update application date and status",
    );
    expect(outreachConfig.labels.contactsTitle).toBe(
      "Add and review interview contacts",
    );
  });
});

describe("brand", () => {
  it("is AimedJobSeek", () => {
    expect(brand.appName).toBe("AimedJobSeek");
    expect(brand.transactionalSenderName).toBe("AimedJobSeek");
    expect(brand.defaultPageTitle).toBe("AimedJobSeek");
    expect(brand.lockupEyebrow).toBe(vocab.campaign.Plural);
    expect(brand.metaDescription).toContain(vocab.outreach.singular);
    expect(brand.metaDescription).toContain(vocab.seeker.plural);
    expect(supportMailtoHref("help@example.test")).toBe(
      "mailto:help@example.test",
    );
    expect(
      referralShareMessage({
        code: "JOIN-1",
        marketingDomain: "example.test",
      }),
    ).toContain(brand.appName);
  });
});

describe("feature flags", () => {
  it("hides team, list, and mailbox UI while keeping referrals", () => {
    expect(features.listImport).toBe(false);
    expect(features.listBulkValidation).toBe(false);
    expect(features.listBulkScoring).toBe(false);
    expect(features.emailConnection).toBe(false);
    expect(features.legacyEmailSequence).toBe(false);
    expect(features.productLevelHiringTeam).toBe(false);
    expect(features.referralProgram).toBe(true);
    expect(features.teamSeats).toBe(false);
    expect(features.teamInvites).toBe(false);
    expect(features.teamRoles).toBe(false);
    expect(features.teamMemberManagement).toBe(false);
    expect(features.contactSales).toBe(false);
    expect(features.teamPlanDisplay).toBe(false);
    expect(features.enterprisePlanDisplay).toBe(false);
    expect(FEATURE_FLAGS).toContain("teamSeats");
    expect(FEATURE_FLAGS).toContain("legacyEmailSequence");
    expect(FEATURE_FLAGS).toContain("productLevelHiringTeam");
  });
});

describe("deployment brand config", () => {
  const valid = {
    APP_URL: "https://app.example.test",
    MARKETING_URL: "https://www.example.test",
    SUPPORT_EMAIL: "help@example.test",
    NODE_ENV: "production",
  };

  it("reads required values with no defaults", () => {
    const deployment = getBrandDeployment(valid);
    expect(deployment.appUrl).toBe("https://app.example.test");
    expect(deployment.appDomain).toBe("app.example.test");
    expect(deployment.marketingUrl).toBe("https://www.example.test");
    expect(deployment.marketingDomain).toBe("example.test");
    expect(deployment.supportEmail).toBe("help@example.test");
  });

  it("fails when a required value is missing", () => {
    expect(() =>
      getBrandDeployment({ ...valid, SUPPORT_EMAIL: "" }),
    ).toThrow(BrandConfigError);
  });

  it("requires https in production", () => {
    expect(() =>
      getBrandDeployment({ ...valid, APP_URL: "http://app.example.test" }),
    ).toThrow(/https/);
  });

  it("requires NEXT_PUBLIC_APP_URL to match APP_URL when set", () => {
    expect(() =>
      assertBrandDeploymentConfig({
        ...valid,
        NEXT_PUBLIC_APP_URL: "https://other.example.test",
      }),
    ).toThrow(/must match/);
  });
});

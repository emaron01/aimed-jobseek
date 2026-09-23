import { describe, expect, it } from "vitest";
import {
  brand,
  countedNoun,
  FEATURE_FLAGS,
  features,
  nounForCount,
  referralShareMessage,
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
    expect(vocab.campaign.singular).toBe("campaign");
    expect(vocab.campaign.Plural).toBe("Campaigns");
    expect(vocab.icp.aSingular).toBe("an ICP");
    expect(vocab.persona.Singular).toBe("Persona");
    expect(nounForCount(1, vocab.contact)).toBe("contact");
    expect(countedNoun(3, vocab.contact)).toBe("3 contacts");
  });
});

describe("brand", () => {
  it("is AimedJobSeek", () => {
    expect(brand.appName).toBe("AimedJobSeek");
    expect(brand.transactionalSenderName).toBe("AimedJobSeek");
    expect(brand.defaultPageTitle).toBe("AimedJobSeek");
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
  it("keeps every flag enabled", () => {
    for (const flag of FEATURE_FLAGS) {
      expect(features[flag]).toBe(true);
    }
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

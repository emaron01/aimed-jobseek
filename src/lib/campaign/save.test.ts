/**
 * Campaign save parsing + action/UI seam tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  EMAIL_GUIDANCE_MAX_CHARS,
  parseCampaignEmailSettingsFormData,
  parseCampaignFormData,
  toSafeCampaignActionError,
} from "@/lib/campaign/save";
import { TenantError } from "@/lib/tenant/errors";

function formFrom(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

describe("parseCampaignFormData", () => {
  it("accepts a valid payload", () => {
    const parsed = parseCampaignFormData(
      formFrom({
        name: "Q1 Outreach",
        productId: "prod_1",
        icpId: "icp_1",
        personaId: "persona_1",
      }),
    );
    expect(parsed.fieldErrors).toEqual({});
    expect(parsed.fields.name).toBe("Q1 Outreach");
    expect(parsed.fields.personaId).toBe("persona_1");
    expect(parsed.fields.personaIds).toEqual(["persona_1"]);
    expect(parsed.fields.emailLength).toBe("MEDIUM");
    expect(parsed.fields.emailGuidance).toBeNull();
    expect(parsed.contactIds).toEqual([]);
  });

  it("collects field errors when required fields are missing", () => {
    const parsed = parseCampaignFormData(
      formFrom({ name: "X", productId: "prod_1" }),
    );
    expect(parsed.fieldErrors.icpId).toBe("ICP is required.");
    expect(parsed.fieldErrors.personaId).toBeUndefined();
    expect(parsed.fields.personaId).toBeNull();
    expect(parsed.fields.personaIds).toEqual([]);
  });

  it("treats omitted personas as all personas for the product", () => {
    const parsed = parseCampaignFormData(
      formFrom({
        name: "Q1 Outreach",
        productId: "prod_1",
        icpId: "icp_1",
        allPersonas: "1",
      }),
    );
    expect(parsed.fieldErrors).toEqual({});
    expect(parsed.fields.personaId).toBeNull();
    expect(parsed.fields.personaIds).toEqual([]);
  });
});

describe("parseCampaignEmailSettingsFormData", () => {
  it("accepts a selected length and optional guidance", () => {
    const parsed = parseCampaignEmailSettingsFormData(
      formFrom({
        emailLength: "LONG",
        emailGuidance: " Emphasize the free trial. ",
      }),
    );

    expect(parsed.fieldErrors).toEqual({});
    expect(parsed.fields).toEqual({
      emailLength: "LONG",
      emailGuidance: "Emphasize the free trial.",
    });
  });

  it("defaults missing length and stores empty guidance as null", () => {
    const parsed = parseCampaignEmailSettingsFormData(formFrom({}));
    expect(parsed.fields.emailLength).toBe("MEDIUM");
    expect(parsed.fields.emailGuidance).toBeNull();
  });

  it("rejects invalid lengths and guidance over 500 characters", () => {
    const parsed = parseCampaignEmailSettingsFormData(
      formFrom({
        emailLength: "FIVE_PARAGRAPH",
        emailGuidance: "x".repeat(EMAIL_GUIDANCE_MAX_CHARS + 1),
      }),
    );

    expect(parsed.fieldErrors.emailLength).toMatch(/valid email length/i);
    expect(parsed.fieldErrors.emailGuidance).toMatch(/500 characters or fewer/i);
  });
});

describe("toSafeCampaignActionError", () => {
  it("surfaces TenantError messages", () => {
    expect(
      toSafeCampaignActionError(
        new TenantError("ICP does not belong to the selected product."),
      ),
    ).toBe("ICP does not belong to the selected product.");
  });
});

describe("campaign save UI seam", () => {
  it("wires useActionState result into visible status", () => {
    const formSrc = readFileSync("src/components/NewCampaignForm.tsx", "utf8");
    const scoreReport = readFileSync("src/components/ScoreReportClient.tsx", "utf8");
    const settingsForm = readFileSync(
      "src/components/CampaignEmailSettingsForm.tsx",
      "utf8",
    );
    const settingsAction = readFileSync(
      "src/app/actions/campaign-email-settings.ts",
      "utf8",
    );
    const detailPage = readFileSync(
      "src/app/(app)/campaigns/[id]/page.tsx",
      "utf8",
    );
    const actionsSrc = readFileSync("src/app/actions.ts", "utf8");

    expect(actionsSrc).toMatch(
      /export async function createCampaignAction\([\s\S]*Promise<CampaignActionResult>/,
    );
    expect(formSrc).toContain("useActionState");
    expect(formSrc).toContain('data-testid="campaign-action-status"');
    expect(scoreReport).toContain("useActionState");
    expect(scoreReport).toContain('data-testid="campaign-action-status"');
    expect(formSrc).toContain("{vocab.persona.Plural} in play");
    expect(formSrc).toContain('name="personaIds"');
    expect(formSrc).toContain('name="allPersonas"');
    expect(scoreReport).toContain('name="allPersonas"');
    expect(scoreReport).not.toContain("Select persona for this campaign");
    expect(formSrc).toContain('name="emailGuidance"');
    expect(scoreReport).toContain('name="emailLength"');
    expect(scoreReport).toContain('name="emailGuidance"');
    expect(settingsForm).toContain("updateCampaignEmailSettingsAction");
    expect(settingsForm).toContain("campaign-email-settings-status");
    expect(settingsAction).toContain(
      "export async function updateCampaignEmailSettingsAction",
    );
    expect(detailPage).toContain("CampaignEmailSettingsForm");
    expect(detailPage).toContain("{vocab.campaign.Singular} guidance");
    expect(detailPage).toContain('?stage=setup');
  });
});

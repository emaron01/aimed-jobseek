import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  campaignPersonasDisplayName,
  parseCampaignPersonaSelection,
  resolveCampaignPersonaIds,
  scoringRunMatchesCampaign,
} from "@/lib/campaign/personas";

function formFrom(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      for (const item of value) fd.append(key, item);
    } else {
      fd.set(key, value);
    }
  }
  return fd;
}

describe("campaign persona selection", () => {
  it("honors a posted personaId when personaIds is omitted", () => {
    expect(
      parseCampaignPersonaSelection(formFrom({ personaId: "persona_legacy" })),
    ).toEqual({
      personaId: "persona_legacy",
      personaIds: ["persona_legacy"],
      allPersonas: false,
    });
  });

  it("defaults to all personas when none are posted", () => {
    expect(parseCampaignPersonaSelection(formFrom({}))).toEqual({
      personaId: null,
      personaIds: [],
      allPersonas: true,
    });
  });

  it("stores a single selected persona as the fallback id", () => {
    expect(
      parseCampaignPersonaSelection(formFrom({ personaIds: ["persona_1"] })),
    ).toEqual({
      personaId: "persona_1",
      personaIds: ["persona_1"],
      allPersonas: false,
    });
  });

  it("keeps a multi-persona subset without a single fallback", () => {
    expect(
      parseCampaignPersonaSelection(
        formFrom({ personaIds: ["persona_1", "persona_2"] }),
      ),
    ).toEqual({
      personaId: null,
      personaIds: ["persona_1", "persona_2"],
      allPersonas: false,
    });
  });

  it("uses Campaign.personaId as fallback when in-play is empty", () => {
    expect(
      resolveCampaignPersonaIds({
        fallbackPersonaId: "persona_legacy",
        inPlayPersonaIds: [],
        productPersonaIds: ["persona_legacy", "persona_2"],
      }),
    ).toEqual(["persona_legacy"]);
    expect(
      resolveCampaignPersonaIds({
        fallbackPersonaId: null,
        inPlayPersonaIds: [],
        productPersonaIds: ["p1", "p2"],
      }),
    ).toEqual(["p1", "p2"]);
  });

  it("treats an all-personas scoring run as compatible with any campaign on the same product and ICP", () => {
    expect(
      scoringRunMatchesCampaign({
        runPersonaId: null,
        campaignFallbackPersonaId: "persona_cro",
        campaignInPlayPersonaIds: [],
        productPersonaIds: ["persona_cro", "persona_revops"],
      }),
    ).toBe(true);
    expect(
      scoringRunMatchesCampaign({
        runPersonaId: "persona_revops",
        campaignFallbackPersonaId: "persona_cro",
        campaignInPlayPersonaIds: [],
        productPersonaIds: ["persona_cro", "persona_revops"],
      }),
    ).toBe(false);
    expect(
      scoringRunMatchesCampaign({
        runPersonaId: "persona_cro",
        campaignFallbackPersonaId: null,
        campaignInPlayPersonaIds: [],
        productPersonaIds: ["persona_cro", "persona_revops"],
      }),
    ).toBe(true);
  });

  it("labels all-personas campaigns without naming a single role", () => {
    expect(
      campaignPersonasDisplayName({
        fallbackPersonaName: null,
        inPlayNames: [],
        productPersonaCount: 3,
      }),
    ).toBe("All personas");
  });

  it("campaign setup no longer requires exactly one persona", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const form = readFileSync("src/components/NewCampaignForm.tsx", "utf8");
    expect(schema).toMatch(/personaId\s+String\?/);
    expect(schema).toContain("model CampaignPersona");
    expect(form).toContain("{vocab.persona.Plural} in play");
    expect(form).not.toContain("Select persona");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildHomeSetupLine,
  formatProductSetupClause,
} from "@/lib/workflow/home-setup-line";
import { getProductCampaignReadiness } from "@/lib/workflow/product-campaign-readiness";
import { countedNoun, vocab } from "@/lib/product-config";

describe("home setup line", () => {
  it("names each product that still needs work", () => {
    const line = buildHomeSetupLine({
      products: [
        {
          name: "OT NOM",
          readiness: getProductCampaignReadiness({
            approvalStatus: "APPROVED",
            icps: [{ criteria: [{}] }],
            personas: [{}],
          }),
        },
        {
          name: "Mathew Sales Forecaster",
          readiness: getProductCampaignReadiness({
            approvalStatus: "APPROVED",
            icps: [],
            personas: [{}],
          }),
        },
      ],
      totalIcps: 1,
      totalPersonas: 5,
    });
    expect(line.text).toBe(
      `OT NOM ready · Mathew Sales Forecaster needs ${vocab.icp.aSingular}`,
    );
    expect(line.href).toBe("/products");
  });

  it("summarizes counts when every product is campaign-ready", () => {
    const ready = getProductCampaignReadiness({
      approvalStatus: "APPROVED",
      icps: [{ criteria: [{}] }],
      personas: [{}],
    });
    const line = buildHomeSetupLine({
      products: [
        { name: "OT NOM", readiness: ready },
        { name: "Mathew Sales Forecaster", readiness: ready },
      ],
      totalIcps: 2,
      totalPersonas: 8,
    });
    expect(line.text).toBe(
      `Setup complete · ${countedNoun(2, vocab.product)} · ${countedNoun(2, vocab.icp)} · ${countedNoun(8, vocab.persona)}`,
    );
  });

  it("does not treat a missing persona as a setup blocker", () => {
    expect(
      formatProductSetupClause(
        "Acme",
        getProductCampaignReadiness({
          approvalStatus: "APPROVED",
          icps: [{ criteria: [{}] }],
          personas: [],
        }),
      ),
    ).toBe("Acme ready");
  });
});

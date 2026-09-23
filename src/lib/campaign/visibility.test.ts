import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canEditCampaignTemplate,
  canOpenCampaignDetail,
  canSetCampaignShared,
  parseCampaignListViewMode,
  shouldUseSharedCampaign,
  CAMPAIGN_LIST_VIEW_MY,
  CAMPAIGN_LIST_VIEW_SHARED_ALL,
} from "@/lib/campaign/visibility";

describe("campaign visibility", () => {
  it("parses list view modes", () => {
    expect(parseCampaignListViewMode(undefined)).toBe(CAMPAIGN_LIST_VIEW_MY);
    expect(parseCampaignListViewMode("SHARED_ALL")).toBe(
      CAMPAIGN_LIST_VIEW_SHARED_ALL,
    );
  });

  it("only OWNER/ADMIN can share", () => {
    expect(canSetCampaignShared("OWNER")).toBe(true);
    expect(canSetCampaignShared("ADMIN")).toBe(true);
    expect(canSetCampaignShared("MEMBER")).toBe(false);
  });

  it("blocks template edits for non-owner on SHARED", () => {
    expect(
      canEditCampaignTemplate({
        role: "MEMBER",
        userId: "u2",
        campaign: { ownerUserId: "u1", visibility: "SHARED" },
      }),
    ).toBe(false);
    expect(
      canEditCampaignTemplate({
        role: "ADMIN",
        userId: "u2",
        campaign: { ownerUserId: "u1", visibility: "SHARED" },
      }),
    ).toBe(false);
    expect(
      canEditCampaignTemplate({
        role: "ADMIN",
        userId: "u2",
        campaign: { ownerUserId: "u2", visibility: "PERSONAL" },
      }),
    ).toBe(true);
    expect(
      shouldUseSharedCampaign({
        userId: "u2",
        campaign: { ownerUserId: "u1", visibility: "SHARED" },
      }),
    ).toBe(true);
  });

  it("blocks opening another member's PERSONAL campaign by URL", () => {
    expect(
      canOpenCampaignDetail({
        role: "MEMBER",
        userId: "u2",
        campaign: { ownerUserId: "u1", visibility: "PERSONAL" },
      }),
    ).toBe(false);
    expect(
      canOpenCampaignDetail({
        role: "MEMBER",
        userId: "u2",
        campaign: { ownerUserId: "u1", visibility: "SHARED" },
      }),
    ).toBe(true);
    expect(
      canOpenCampaignDetail({
        role: "ADMIN",
        userId: "u2",
        campaign: { ownerUserId: "u1", visibility: "PERSONAL" },
      }),
    ).toBe(true);
  });

  it("puts sharing in the campaign header instead of the Setup stage", () => {
    const page = readFileSync(
      "src/app/(app)/campaigns/[id]/page.tsx",
      "utf8",
    );
    expect(page).toContain("CampaignVisibilityButton");
    expect(page).not.toContain("CampaignVisibilityForm");
    expect(page.indexOf("<CampaignVisibilityButton")).toBeLessThan(
      page.indexOf("<CampaignStageRail"),
    );
  });

  it("gives OWNER and ADMIN an org-wide campaign index", () => {
    const data = readFileSync("src/lib/tenant/data.ts", "utf8");
    const page = readFileSync("src/app/(app)/campaigns/page.tsx", "utf8");
    expect(data).toContain(
      "visibilityWhere = canViewEveryCampaign ? {} : { visibility: \"SHARED\" }",
    );
    expect(page).toContain("All org ${vocab.campaign.plural}");
    expect(page).toContain("<th className=\"px-4 py-3 font-medium\">Owner</th>");
  });

  it("uses shared campaigns only by making a PERSONAL config copy", () => {
    const action = readFileSync(
      "src/app/actions/campaign-sharing.ts",
      "utf8",
    );
    const ui = readFileSync("src/components/SharedCampaignActions.tsx", "utf8");
    const duplicate = readFileSync("src/lib/campaign/duplicate.ts", "utf8");

    expect(action).toContain("duplicateSharedCampaign");
    expect(action).not.toContain("createCampaignExecution");
    expect(action).not.toContain("duplicateSharedCampaignAction");
    expect(ui).toContain("Use this {vocab.campaign.singular}");
    expect(ui).not.toContain("Duplicate as mine");
    expect(duplicate).toContain('visibility: "PERSONAL"');
    expect(duplicate).not.toContain("campaignContact");
  });

  it("has no runtime CampaignExecution or executionId model dependency", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const detail = readFileSync(
      "src/app/(app)/campaigns/[id]/page.tsx",
      "utf8",
    );
    const contacts = readFileSync("src/lib/campaign/contacts.ts", "utf8");
    const actions = readFileSync(
      "src/app/actions/campaign-contacts.ts",
      "utf8",
    );

    expect(schema).not.toContain("CampaignExecution");
    expect(schema).not.toContain("executionId");
    expect(detail).not.toContain("executionId");
    expect(detail).not.toContain("?execution=");
    expect(contacts).not.toContain("executionId");
    expect(actions).not.toContain("executionId");
  });
});

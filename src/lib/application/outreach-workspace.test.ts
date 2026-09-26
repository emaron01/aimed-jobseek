import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contactOutreachStatus } from "@/components/ApplicationOutreachSections";
import { formatOutreachTypeLabel } from "@/lib/application-assets/display";
import { hiringTeamConfig, outreachConfig } from "@/lib/product-config";

const emptyAsset = {
  id: "asset_1",
  type: "EMAIL" as const,
  version: 1,
  status: "DRAFT" as const,
  personaId: "role_1",
  contactId: "contact_1",
  purpose: "PROACTIVE" as const,
  sentAt: null,
  createdAt: "2026-09-26T12:00:00.000Z",
  emailLength: "MEDIUM" as const,
  content: null,
};

describe("application outreach workspace", () => {
  it("adds a named contact with a Hiring Team role and shows status", () => {
    const section = readFileSync(
      "src/components/ApplicationOutreachSections.tsx",
      "utf8",
    );
    const action = readFileSync("src/app/actions/application-outreach.ts", "utf8");
    expect(section).toContain("add-application-contact");
    expect(section).toContain('name="firstName"');
    expect(section).toContain('name="lastName"');
    expect(section).toContain('name="title"');
    expect(section).toContain('name="personaId" required');
    expect(section).toContain("outreach-contact-status-");
    expect(action).toContain("Choose ${vocab.persona.aSingular}");
    expect(contactOutreachStatus([], "contact_1")).toBe(
      outreachConfig.labels.contactStatusNone,
    );
    expect(contactOutreachStatus([emptyAsset], "contact_1")).toBe(
      outreachConfig.labels.contactStatusDraft,
    );
    expect(
      contactOutreachStatus(
        [{ ...emptyAsset, sentAt: "2026-09-26T12:00:00.000Z" }],
        "contact_1",
      ),
    ).toContain(outreachConfig.labels.sentStatus);
  });

  it("lists each contact sequence with type and sent date", () => {
    const section = readFileSync(
      "src/components/ApplicationOutreachSections.tsx",
      "utf8",
    );
    expect(section).toContain("outreach-sequence");
    expect(section).toContain("formatOutreachTypeLabel(asset.type)");
    expect(section).toContain("asset.sentAt");
    expect(section).toContain("add-next-outreach");
    expect(section).not.toContain("generate-outreach");
    expect(section).toContain('option value="EMAIL"');
    expect(section).toContain('option value="LINKEDIN_CONNECTION_NOTE"');
    expect(section).toContain('option value="LINKEDIN_INMAIL"');
    expect(formatOutreachTypeLabel("EMAIL")).toBe("Email");
    expect(formatOutreachTypeLabel("LINKEDIN_CONNECTION_NOTE")).toBe(
      "LinkedIn connection note",
    );
    expect(formatOutreachTypeLabel("LINKEDIN_INMAIL")).toBe("LinkedIn InMail");
  });

  it("reuses the gated contact-list and selected-sequence layout", () => {
    const drafts = readFileSync("src/components/EmailDraftsStage.tsx", "utf8");
    const section = readFileSync(
      "src/components/ApplicationOutreachSections.tsx",
      "utf8",
    );
    expect(drafts).toContain("lg:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]");
    expect(section).toContain("lg:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]");
    expect(section).toContain("email-handoff");
    expect(section).toContain("linkedin-handoff");
    expect(section).toContain("markOutreachSentAction");
  });
});

describe("hiring team persona actions", () => {
  it("shows Edit and Build as visible buttons", () => {
    const actions = readFileSync(
      "src/components/HiringTeamRoleActions.tsx",
      "utf8",
    );
    const workspace = readFileSync(
      "src/components/ApplicationWorkspace.tsx",
      "utf8",
    );
    expect(actions).toContain("HiringTeamRoleActions");
    expect(actions).toContain("hiringTeamConfig.actions.edit");
    expect(actions).toContain("hiringTeamConfig.actions.knowWhoInterviewing");
    expect(actions).toContain('variant="secondary"');
    expect(workspace).toContain("HiringTeamRoleActions");
    expect(workspace).toContain("build-role-");
    expect(actions).toContain(hiringTeamConfig.actions.edit);
  });
});

describe("company research status", () => {
  it("renders Employer research once on the company page", () => {
    const workspace = readFileSync(
      "src/components/ApplicationWorkspace.tsx",
      "utf8",
    );
    const companyBlock = workspace.slice(
      workspace.indexOf('data-testid="application-company"'),
      workspace.indexOf('data-testid="application-workspace"'),
    );
    const matches = companyBlock.match(/ApplicationResearchStatus/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(companyBlock).toContain("IdentityVerificationPanel");
  });
});

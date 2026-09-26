import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  contactOutreachStatus,
  latestOutreachMessageId,
  sentMessagesForContact,
} from "@/components/ApplicationOutreachSections";
import {
  formatOutreachGeneratorKindLabel,
  formatOutreachHistoryLine,
  formatOutreachTypeLabel,
  resolveOutreachGeneratorKind,
} from "@/lib/application-assets/display";
import { resolveInterviewThankYouNotes } from "@/lib/application-assets/display";
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

  it("lists sent messages under each name with type and date and opens on click", () => {
    const section = readFileSync(
      "src/components/ApplicationOutreachSections.tsx",
      "utf8",
    );
    const action = readFileSync("src/app/actions/application-outreach.ts", "utf8");
    const email = {
      ...emptyAsset,
      id: "asset_email",
      sentAt: "2026-09-26T12:00:00.000Z",
    };
    const note = {
      ...emptyAsset,
      id: "asset_note",
      type: "LINKEDIN_CONNECTION_NOTE" as const,
      sentAt: "2026-09-27T12:00:00.000Z",
      createdAt: "2026-09-27T12:00:00.000Z",
    };
    const draft = {
      ...emptyAsset,
      id: "asset_draft",
      sentAt: null,
      createdAt: "2026-09-28T12:00:00.000Z",
    };
    expect(sentMessagesForContact([email, note, draft], "contact_1")).toEqual([
      email,
      note,
    ]);
    expect(sentMessagesForContact([email, note], "contact_other")).toEqual([]);
    expect(formatOutreachHistoryLine(email.type, email.sentAt)).toBe(
      `${outreachConfig.labels.kindEmail} · ${outreachConfig.labels.sentStatus} Sep 26`,
    );
    expect(formatOutreachHistoryLine(note.type, note.sentAt)).toBe(
      `${outreachConfig.labels.kindLinkedInNote} · ${outreachConfig.labels.sentStatus} Sep 27`,
    );
    expect(latestOutreachMessageId([email, note, draft], "contact_1")).toBe(
      "asset_draft",
    );
    expect(section).toContain("outreach-contact-history-");
    expect(section).toContain("outreach-history-");
    expect(section).toContain("formatOutreachHistoryLine");
    expect(section).toContain("openContact(contact.contactId, asset.id)");
    expect(section).toContain("openedMessage");
    expect(section).not.toContain("selectedMessages.map");
    expect(action).toContain("markOutreachSent");
    expect(action).toContain("sentAt:");
  });

  it("uses one generator for the four message kinds and the prompt instructions", () => {
    const section = readFileSync(
      "src/components/ApplicationOutreachSections.tsx",
      "utf8",
    );
    const action = readFileSync("src/app/actions/application-outreach.ts", "utf8");
    const outreach = readFileSync(
      "src/lib/application-assets/outreach.ts",
      "utf8",
    );
    expect(section).toContain("add-next-outreach");
    expect(section).toContain("outreach-generator-kind");
    expect(section).toContain("outreach-generator-prompt");
    expect(section).toContain("GENERATOR_KINDS");
    expect(section).toContain('"INTERVIEW_THANK_YOU"');
    expect(section).toContain("name=\"kind\"");
    expect(section).toContain("name=\"regenerationInstruction\"");
    expect(section).toContain("outreachConfig.labels.generatorPrompt");
    expect(section).toContain("email-handoff");
    expect(section).toContain("linkedin-handoff");
    expect(section).toContain("openOutlookWeb");
    expect(section).toContain("openOutlookDesktop");
    expect(section).toContain("openGmail");
    expect(section).toContain("copyBody");
    expect(section).toContain("downloadResume");
    expect(formatOutreachTypeLabel("EMAIL")).toBe(outreachConfig.labels.kindEmail);
    expect(formatOutreachTypeLabel("LINKEDIN_CONNECTION_NOTE")).toBe(
      outreachConfig.labels.kindLinkedInNote,
    );
    expect(formatOutreachTypeLabel("LINKEDIN_INMAIL")).toBe(
      outreachConfig.labels.kindLinkedInInMail,
    );
    expect(formatOutreachGeneratorKindLabel("INTERVIEW_THANK_YOU")).toBe(
      outreachConfig.labels.kindThankYou,
    );
    expect(resolveOutreachGeneratorKind("EMAIL")).toEqual({
      type: "EMAIL",
      purpose: null,
    });
    expect(resolveOutreachGeneratorKind("LINKEDIN_CONNECTION_NOTE")).toEqual({
      type: "LINKEDIN_CONNECTION_NOTE",
      purpose: null,
    });
    expect(resolveOutreachGeneratorKind("LINKEDIN_INMAIL")).toEqual({
      type: "LINKEDIN_INMAIL",
      purpose: null,
    });
    expect(resolveOutreachGeneratorKind("INTERVIEW_THANK_YOU")).toEqual({
      type: "EMAIL",
      purpose: "THANK_YOU",
    });
    expect(() => resolveOutreachGeneratorKind("SMS")).toThrow(
      "Outreach message type is invalid.",
    );
    expect(action).toContain("resolveOutreachGeneratorKind");
    expect(action).toContain("regenerationInstruction");
    expect(action).toContain("assetType: type");
    expect(action).toContain("purpose,");
    expect(action).toContain("contactId:");
    expect(
      resolveInterviewThankYouNotes({
        notesAfter: null,
        regenerationInstruction:
          "thank her for the call and mention the forecast discussion",
      }),
    ).toEqual({
      notes: "thank her for the call and mention the forecast discussion",
      usedInstruction: true,
    });
    expect(
      resolveInterviewThankYouNotes({
        notesAfter: "We covered the forecast.",
        regenerationInstruction: "keep it short",
      }),
    ).toEqual({ notes: "We covered the forecast.", usedInstruction: false });
    expect(outreach).toContain("resolveInterviewThankYouNotes");
    expect(outreach).toContain("regenerationInstruction: input.regenerationInstruction");
    expect(outreach).toContain("guidance: input.regenerationInstruction");
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

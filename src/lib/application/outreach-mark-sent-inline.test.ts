import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  OutreachMessageCard,
  sentMessagesForContact,
} from "@/components/ApplicationOutreachSections";
import { outreachConfig } from "@/lib/product-config";

function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const claim = {
  id: "p1",
  text: "I applied this week.",
  supports: [{ sourceId: "profile:name", quote: "Alex" }],
};

const emailContent = {
  type: "EMAIL" as const,
  subject: "Applied for Senior Product Engineer",
  greeting: "Hello,",
  paragraphs: [claim],
  signoff: "Thanks",
  signerName: "Alex Chen",
};

const noteContent = {
  type: "LINKEDIN_CONNECTION_NOTE" as const,
  greeting: "Hello,",
  body: claim,
};

const contact = {
  contactId: "contact_1",
  firstName: "Priya",
  lastName: "Shah",
  title: "Director",
  email: "priya@example.test",
  linkedinUrl: "https://www.linkedin.com/in/priya",
  personaId: "role_1",
  personaName: "Hiring Manager",
  roleConfirmed: true,
  linkedInProfileText: null,
  extractedTitle: null,
  individualStatus: null,
  individualError: null,
  commonGround: [],
  caresAbout: [],
};

function message(overrides: {
  id: string;
  type: "EMAIL" | "LINKEDIN_CONNECTION_NOTE";
  sentAt: string | null;
  content: unknown;
}) {
  return {
    id: overrides.id,
    type: overrides.type,
    version: 1,
    status: overrides.sentAt ? ("APPROVED" as const) : ("DRAFT" as const),
    personaId: "role_1",
    contactId: contact.contactId,
    purpose: "PROACTIVE" as const,
    sentAt: overrides.sentAt,
    createdAt: "2026-09-29T12:00:00.000Z",
    emailLength: "MEDIUM" as const,
    content: overrides.content,
  };
}

function renderCard(asset: ReturnType<typeof message>) {
  let sentCalled = false;
  const html = renderToStaticMarkup(
    createElement(OutreachMessageCard, {
      campaignId: "campaign_1",
      canEdit: true,
      asset,
      contacts: [contact],
      approvedResumeId: "resume_1",
      sentAction: () => {
        sentCalled = true;
      },
      generateAction: () => {
        throw new Error("generate during render");
      },
    }),
  );
  return { html, sentCalled };
}

describe("inline mark as sent", () => {
  it("shows one dated Mark as sent control in the email handoff row", () => {
    const asset = message({
      id: "asset_email",
      type: "EMAIL",
      sentAt: null,
      content: emailContent,
    });
    const { html, sentCalled } = renderCard(asset);
    const handoffStart = html.indexOf('data-testid="email-handoff"');
    const regenerateStart = html.indexOf(
      'data-testid="outreach-regenerate-asset_email"',
    );
    const row = html.slice(handoffStart, regenerateStart);
    expect(handoffStart).toBeGreaterThan(-1);
    expect(regenerateStart).toBeGreaterThan(handoffStart);
    expect(row).toContain('data-testid="outreach-mark-sent-asset_email"');
    expect(row).toContain(outreachConfig.labels.openOutlookWeb);
    expect(row).toContain(outreachConfig.labels.openOutlookDesktop);
    expect(row).toContain(outreachConfig.labels.openGmail);
    expect(row).toContain(outreachConfig.labels.downloadResume);
    expect(row).toContain('name="sentAt"');
    expect(row).toContain(`value="${localToday()}"`);
    expect(row).toContain(`>${outreachConfig.labels.markSent}<`);
    expect(html.match(/outreach-mark-sent-asset_email/g)).toHaveLength(1);
    expect(html.slice(regenerateStart)).not.toContain(
      "outreach-mark-sent-asset_email",
    );
    expect(html).not.toContain('data-testid="did-you-send-asset_email"');
    expect(sentCalled).toBe(false);
  });

  it("shows one Mark as sent control on a LinkedIn message and none on a second form", () => {
    const asset = message({
      id: "asset_note",
      type: "LINKEDIN_CONNECTION_NOTE",
      sentAt: null,
      content: noteContent,
    });
    const { html } = renderCard(asset);
    const handoffStart = html.indexOf('data-testid="linkedin-handoff"');
    const regenerateStart = html.indexOf(
      'data-testid="outreach-regenerate-asset_note"',
    );
    const row = html.slice(handoffStart, regenerateStart);
    expect(row).toContain('data-testid="outreach-mark-sent-asset_note"');
    expect(row).toContain(outreachConfig.labels.copyBody);
    expect(row).toContain(`value="${localToday()}"`);
    expect(html).not.toContain('data-testid="email-handoff"');
    expect(html.match(/outreach-mark-sent-asset_note/g)).toHaveLength(1);
    expect(html.slice(regenerateStart)).not.toContain(
      "outreach-mark-sent-asset_note",
    );
  });

  it("shows the sent date in the handoff row and no mark control", () => {
    const sentAt = "2026-09-02T12:00:00.000Z";
    const asset = message({
      id: "asset_sent",
      type: "EMAIL",
      sentAt,
      content: emailContent,
    });
    const { html, sentCalled } = renderCard(asset);
    const handoffStart = html.indexOf('data-testid="email-handoff"');
    const regenerateStart = html.indexOf(
      'data-testid="outreach-regenerate-asset_sent"',
    );
    const row = html.slice(handoffStart, regenerateStart);
    expect(row).toContain('data-testid="outreach-sent-date-asset_sent"');
    expect(row).toContain(
      `${outreachConfig.labels.sentStatus} ${sentAt.slice(0, 10)}`,
    );
    expect(row).toContain(outreachConfig.labels.openOutlookWeb);
    expect(row).toContain(outreachConfig.labels.downloadResume);
    expect(html).not.toContain("outreach-mark-sent-asset_sent");
    expect(html).not.toContain(`>${outreachConfig.labels.markSent}<`);
    expect(html).not.toContain('data-testid="did-you-send-asset_sent"');
    expect(sentCalled).toBe(false);
    expect(
      sentMessagesForContact([asset, { ...asset, id: "draft", sentAt: null }], "contact_1").map(
        (row) => row.id,
      ),
    ).toEqual(["asset_sent"]);
  });

  it("keeps the did-you-send prompt on the existing mark-sent path without paying on render", () => {
    const section = readFileSync(
      "src/components/ApplicationOutreachSections.tsx",
      "utf8",
    );
    const action = readFileSync(
      "src/app/actions/application-outreach.ts",
      "utf8",
    );
    const recorder = readFileSync(
      "src/lib/application-assets/outreach.ts",
      "utf8",
    );
    expect(section).toContain("openEmailOption");
    expect(section).toContain("promptIfUnsent");
    expect(section).toContain("confirmSentToday");
    expect(section).toContain("sentDateRef.current.value = todayInputValue()");
    expect(section).toContain("sentFormRef.current?.requestSubmit()");
    expect(section).toContain("outreachConfig.labels.didYouSendPrompt");
    expect(section).toContain("outreachConfig.labels.didYouSendYes");
    expect(section).toContain("outreachConfig.labels.didYouSendNotYet");
    const notYet = section.slice(
      section.indexOf("did-you-send-not-yet-"),
      section.indexOf("did-you-send-not-yet-") + 400,
    );
    expect(notYet).toContain("setAskSent(false)");
    expect(notYet).not.toContain("requestSubmit");
    const markAction = action.slice(
      action.indexOf("export async function markOutreachSentAction"),
      action.indexOf("export async function markOutreachSentAction") + 900,
    );
    expect(markAction).toContain("markOutreachSent");
    expect(markAction).toContain("sentAt:");
    expect(markAction).not.toContain("enqueueApplicationJob");
    expect(recorder).toContain('data: { sentAt: input.sentAt, status: "APPROVED" }');
    expect(section).not.toContain("enqueueApplicationJob");
    expect(section).not.toContain("runPaidStructuredCall");
    expect(outreachConfig.labels.didYouSendPrompt).toBe(
      "Did you send this message?",
    );
    expect(outreachConfig.labels.didYouSendYes).toBe("Yes, mark as sent");
    expect(outreachConfig.labels.didYouSendNotYet).toBe("Not yet");
  });
});

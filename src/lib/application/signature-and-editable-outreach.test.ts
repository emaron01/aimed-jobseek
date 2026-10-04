// @vitest-environment happy-dom
/**
 * Signature block, hidden HTML signature, and in-place outreach edits.
 */
import { readFileSync } from "node:fs";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasTestDatabase } from "@/test/database";

const saveOutreachMessageEditAction = vi.hoisted(() =>
  vi.fn(
    async (
      _previous: { ok: boolean; message: string } | null,
      formData: FormData,
    ) => ({
      ok: true,
      message: "Message saved.",
      assetId: String(formData.get("assetId") ?? ""),
      subject: formData.has("subject") ? String(formData.get("subject") ?? "") : null,
      body: String(formData.get("body") ?? ""),
    }),
  ),
);
const enqueueApplicationJob = vi.hoisted(() => vi.fn());
const runPaidStructuredCall = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

vi.mock("@/app/actions/signature", () => ({
  saveEmailSignatureAction: vi.fn(async () => ({ ok: true, message: "Saved." })),
}));

vi.mock("@/app/actions/application-outreach", () => ({
  addApplicationContactAction: vi.fn(),
  buildOutreachPersonaThenGenerateAction: vi.fn(),
  generateOutreachAssetAction: vi.fn(),
  markApplicationAppliedAction: vi.fn(),
  setApplicationProgressAction: vi.fn(),
  markOutreachSentAction: vi.fn(),
  saveOutreachMessageEditAction: (
    previous: { ok: boolean; message: string } | null,
    formData: FormData,
  ) => saveOutreachMessageEditAction(previous, formData),
  updateApplicationContactRoleAction: vi.fn(),
}));

vi.mock("@/lib/application-jobs/service", () => ({
  enqueueApplicationJob: (...args: unknown[]) => enqueueApplicationJob(...args),
}));

vi.mock("@/lib/ai/paid-call-gate", () => ({
  runPaidStructuredCall: (...args: unknown[]) => runPaidStructuredCall(...args),
}));

import { EmailSignatureForm } from "@/components/EmailSignatureForm";
import { OutreachMessageCard } from "@/components/ApplicationOutreachSections";
import { composeOutreachText } from "@/lib/application-assets/contract";
import { outreachEmailHandoff } from "@/lib/application-assets/handoff";
import { buildMicrosoftGraphSendMailPayload } from "@/lib/email-generation/email-body";
import { emailSignatureCopy, outreachConfig } from "@/lib/product-config";

const support = [{ sourceId: "profile:name", quote: "Jordan" }];
const signature = "Jordan Lee\nhttps://linkedin.com/in/jordan";

const emailContent = {
  type: "EMAIL" as const,
  subject: "Introduction",
  greeting: "Hello,",
  paragraphs: [
    { id: "p1", text: "First paragraph.", supports: support },
    { id: "p2", text: "Second paragraph.", supports: support },
  ],
  signoff: "Thanks",
  signerName: "Alex Chen",
};

function message(input: {
  id: string;
  type: "EMAIL" | "LINKEDIN_CONNECTION_NOTE" | "LINKEDIN_INMAIL";
  purpose?: "PROACTIVE" | "FOLLOW_UP" | "THANK_YOU" | "CHECK_IN";
  content: unknown;
}) {
  return {
    id: input.id,
    type: input.type,
    version: 1,
    status: "DRAFT" as const,
    personaId: "role_1",
    contactId: "contact_1",
    purpose: input.purpose ?? "PROACTIVE",
    sentAt: null,
    createdAt: "2026-10-04T12:00:00.000Z",
    emailLength: "MEDIUM" as const,
    content: input.content,
  };
}

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

function mount(node: ReactNode): { host: HTMLElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { host, root };
}

function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function decodedBody(href: string): string {
  const query = href.slice(href.indexOf("?") + 1);
  return new URLSearchParams(query).get("body") ?? "";
}

function card(asset: ReturnType<typeof message>, emailSignature: string | null = signature) {
  return createElement(OutreachMessageCard, {
    campaignId: "camp_1",
    canEdit: true,
    asset,
    contacts: [contact],
    approvedResumeId: null,
    emailSignature,
    sentAction: () => undefined,
    generateAction: () => {
      throw new Error("generate during render");
    },
  });
}

describe("signature panel and outreach message window", () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    document.body.innerHTML = "";
    saveOutreachMessageEditAction.mockClear();
    enqueueApplicationJob.mockClear();
    runPaidStructuredCall.mockClear();
  });

  it("hides the HTML signature and shows the two guidance lines above the block", () => {
    const view = mount(createElement(EmailSignatureForm, { signature: null }));
    root = view.root;
    expect(view.host.querySelector("[name='htmlBody']")).toBeNull();
    expect(view.host.querySelector("[data-testid='email-signature-html-preview']")).toBeNull();
    expect(view.host.textContent).not.toContain("HTML (optional)");
    const outlook = view.host.querySelector(
      "[data-testid='signature-outlook-guidance']",
    );
    const gmail = view.host.querySelector("[data-testid='signature-gmail-guidance']");
    const block = view.host.querySelector("textarea[name='body']");
    expect(outlook?.textContent).toBe(emailSignatureCopy.outlookLine);
    expect(gmail?.textContent).toBe(emailSignatureCopy.gmailLine);
    expect(outlook?.compareDocumentPosition(gmail!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(gmail?.compareDocumentPosition(block!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();
  });

  it("edits every outreach message type in place without a paid call", () => {
    const note = {
      type: "LINKEDIN_CONNECTION_NOTE" as const,
      greeting: "Hello,",
      body: { id: "n1", text: "One note.", supports: support },
    };
    const inmail = {
      type: "LINKEDIN_INMAIL" as const,
      subject: "A subject",
      greeting: "Hello,",
      paragraphs: [{ id: "i1", text: "One InMail paragraph.", supports: support }],
    };
    const assets = [
      message({ id: "email_proactive", type: "EMAIL", purpose: "PROACTIVE", content: emailContent }),
      message({ id: "email_follow", type: "EMAIL", purpose: "FOLLOW_UP", content: emailContent }),
      message({ id: "email_thanks", type: "EMAIL", purpose: "THANK_YOU", content: emailContent }),
      message({ id: "email_check", type: "EMAIL", purpose: "CHECK_IN", content: emailContent }),
      message({ id: "note_1", type: "LINKEDIN_CONNECTION_NOTE", content: note }),
      message({ id: "inmail_1", type: "LINKEDIN_INMAIL", content: inmail }),
    ];
    const view = mount(
      createElement(
        "div",
        null,
        assets.map((asset) => createElement("div", { key: asset.id }, card(asset))),
      ),
    );
    root = view.root;
    for (const asset of assets) {
      const body = view.host.querySelector(
        `[data-testid='outreach-edit-body-${asset.id}']`,
      ) as HTMLTextAreaElement;
      expect(body).toBeTruthy();
      if (asset.type === "EMAIL") {
        expect(body.value.endsWith(signature)).toBe(true);
        expect(body.value.split(signature).length - 1).toBe(1);
        expect(body.value).not.toContain("Alex Chen");
      } else {
        expect(body.value).not.toContain(signature);
      }
      if (asset.type === "LINKEDIN_CONNECTION_NOTE") {
        expect(
          view.host.querySelector(`[data-testid='outreach-edit-subject-${asset.id}']`),
        ).toBeNull();
      }
    }
    const edited = "Hello,\n\nFirst paragraph.\n\nEdited paragraph.\n\n" + signature;
    const emailBody = view.host.querySelector(
      "[data-testid='outreach-edit-body-email_proactive']",
    ) as HTMLTextAreaElement;
    act(() => {
      typeInto(emailBody, edited);
    });
    const form = view.host.querySelector(
      "[data-testid='outreach-edit-email_proactive']",
    ) as HTMLFormElement;
    act(() => {
      form.requestSubmit();
    });
    expect(saveOutreachMessageEditAction).toHaveBeenCalledTimes(1);
    const savedBody = String(
      saveOutreachMessageEditAction.mock.calls[0]?.[1].get("body"),
    );
    expect(savedBody).toBe(edited);
    expect(savedBody).toContain("\n\n");
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();

    const action = readFileSync("src/app/actions/application-outreach.ts", "utf8");
    const saveAction = action.slice(
      action.indexOf("export async function saveOutreachMessageEditAction"),
    );
    expect(saveAction).not.toContain("enqueueApplicationJob");
    expect(saveAction).not.toContain("runPaidStructuredCall");
    const generateAction = action.slice(
      action.indexOf("export async function generateOutreachAssetAction"),
      action.indexOf("export async function buildOutreachPersonaThenGenerateAction"),
    );
    expect(generateAction).toContain("enqueueApplicationJob");
    expect(view.host.querySelector("[data-testid='outreach-regenerate-email_proactive']")).toBeTruthy();
  });
});

const describeDb = hasTestDatabase() ? describe : describe.skip;

describeDb("signature block and saved outreach edits", { timeout: 60_000 }, () => {
  it("uses the plain signature once on every email path and keeps a saved edit", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    const prisma = new PrismaClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const orgIds: string[] = [];
    try {
      const workspace = await createIndividualWorkspace({
        email: `sig-edit-${suffix}@example.test`,
        name: "Signature Seeker",
      });
      orgIds.push(workspace.organization.id);
      const {
        getEmailSignatureForSend,
        upsertEmailSignatureForUser,
      } = await import("@/lib/signature/signature");
      const { saveOutreachMessageEdit, markOutreachSent } = await import(
        "@/lib/application-assets/outreach"
      );
      await upsertEmailSignatureForUser({
        organizationId: workspace.organization.id,
        userId: workspace.user.id,
        body: signature,
        htmlBody: '<p><img src="https://example.com/logo.png" alt="Logo"></p>',
      });
      const forSend = await getEmailSignatureForSend({
        organizationId: workspace.organization.id,
        userId: workspace.user.id,
      });
      expect(forSend).toEqual({ text: signature, html: null });
      const keptHtml = await upsertEmailSignatureForUser({
        organizationId: workspace.organization.id,
        userId: workspace.user.id,
        body: signature,
      });
      expect(keptHtml.htmlBody).toContain("logo.png");

      const htmlOnly = await createIndividualWorkspace({
        email: `html-only-${suffix}@example.test`,
        name: "HTML Only",
      });
      orgIds.push(htmlOnly.organization.id);
      await upsertEmailSignatureForUser({
        organizationId: htmlOnly.organization.id,
        userId: htmlOnly.user.id,
        body: "",
        htmlBody: "<p>Hidden signature</p>",
      });
      expect(
        await getEmailSignatureForSend({
          organizationId: htmlOnly.organization.id,
          userId: htmlOnly.user.id,
        }),
      ).toEqual({ text: null, html: null });

      const unsigned = composeOutreachText(emailContent);
      expect(unsigned.body).toBe("Hello,\n\nFirst paragraph.\n\nSecond paragraph.");
      expect(unsigned.body).not.toContain("Thanks");
      expect(unsigned.body).not.toContain("Alex Chen");
      const signed = composeOutreachText(emailContent, { emailSignature: signature });
      expect(signed.body.endsWith(signature)).toBe(true);
      expect(signed.body.split(signature).length - 1).toBe(1);
      expect(signed.body).not.toContain("Alex Chen");

      const product = await prisma.product.create({
        data: {
          organizationId: workspace.organization.id,
          name: `Profile ${suffix}`,
          approvalStatus: "APPROVED",
        },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId: workspace.organization.id,
          ownerUserId: workspace.user.id,
          name: `Outreach ${suffix}`,
          productId: product.id,
        },
      });
      const stored = await prisma.applicationAsset.create({
        data: {
          organizationId: workspace.organization.id,
          campaignId: campaign.id,
          type: "EMAIL",
          groupKey: "EMAIL:none:none:PROACTIVE",
          version: 1,
          contentJson: emailContent,
          claimTraceJson: [],
          promptVersion: "5",
        },
      });
      const row = await prisma.applicationAsset.findUniqueOrThrow({
        where: { id: stored.id },
      });
      const parsed = composeOutreachText(
        row.contentJson as typeof emailContent,
        { emailSignature: forSend.text },
      );
      expect(parsed.body).toBe(signed.body);
      expect((row.contentJson as { signoff: string }).signoff).toBe("Thanks");
      expect((row.contentJson as { signerName: string }).signerName).toBe("Alex Chen");

      const handoff = outreachEmailHandoff({
        to: "priya@example.test",
        subject: parsed.subject ?? "",
        body: parsed.body,
      });
      for (const href of [
        handoff.outlookWeb.href,
        handoff.outlookDesktop.href,
        handoff.gmailWeb.href,
      ]) {
        const body = decodedBody(href ?? "");
        expect(body.endsWith(signature.replaceAll("\n", "\r\n"))).toBe(true);
        expect(body.split("Jordan Lee").length - 1).toBe(1);
      }
      expect(parsed.body.endsWith(signature)).toBe(true);

      const graph = buildMicrosoftGraphSendMailPayload({
        to: "priya@example.test",
        subject: parsed.subject ?? "",
        body: "Hello,\n\nFirst paragraph.\n\nSecond paragraph.",
        signatureText: forSend.text,
        signatureHtml: forSend.html,
      });
      expect(graph.message.body.contentType).toBe("Text");
      expect(graph.message.body.content.endsWith(signature.replaceAll("\n", "\r\n"))).toBe(true);
      expect(graph.message.body.content).not.toContain("logo.png");
      expect(graph.message.body.content).not.toContain("<p>");

      const note = composeOutreachText(
        {
          type: "LINKEDIN_CONNECTION_NOTE",
          greeting: "Hello,",
          body: { id: "n1", text: "One note.", supports: support },
        },
        { emailSignature: signature },
      );
      expect(note.body).toBe("Hello, One note.");
      expect(note.body).not.toContain(signature);
      const inmail = composeOutreachText(
        {
          type: "LINKEDIN_INMAIL",
          subject: "A subject",
          greeting: "Hello,",
          paragraphs: [{ id: "i1", text: "One InMail paragraph.", supports: support }],
        },
        { emailSignature: signature },
      );
      expect(inmail.body).not.toContain(signature);

      const edited = "Hello,\n\nFirst paragraph.\n\nEdited paragraph.\n\n" + signature;
      const saved = await saveOutreachMessageEdit({
        organizationId: workspace.organization.id,
        campaignId: campaign.id,
        userId: workspace.user.id,
        assetId: stored.id,
        subject: "Edited subject",
        body: edited,
      });
      expect(saved.body).toBe(edited);
      const after = await prisma.applicationAsset.findUniqueOrThrow({
        where: { id: stored.id },
      });
      const json = after.contentJson as {
        signoff: string;
        signerName: string;
        seekerEdit: { subject: string; body: string };
      };
      expect(json.signoff).toBe("Thanks");
      expect(json.signerName).toBe("Alex Chen");
      expect(json.seekerEdit.body).toBe(edited);
      const shown = composeOutreachText(after.contentJson as typeof emailContent, {
        emailSignature: signature,
      });
      expect(shown.subject).toBe("Edited subject");
      expect(shown.body).toBe(edited);
      expect(shown.body.split(signature).length - 1).toBe(1);
      const editedHandoff = outreachEmailHandoff({
        to: "priya@example.test",
        subject: shown.subject ?? "",
        body: shown.body,
      });
      expect(decodedBody(editedHandoff.gmailWeb.href ?? "")).toContain(
        "First paragraph.\r\n\r\nEdited paragraph.",
      );
      await markOutreachSent({
        organizationId: workspace.organization.id,
        campaignId: campaign.id,
        userId: workspace.user.id,
        assetId: stored.id,
        sentAt: new Date("2026-10-04T15:00:00.000Z"),
      });
      const sent = await prisma.applicationAsset.findUniqueOrThrow({
        where: { id: stored.id },
      });
      expect(
        (sent.contentJson as { seekerEdit: { body: string } }).seekerEdit.body,
      ).toBe(edited);
      expect(
        await prisma.applicationAsset.count({ where: { campaignId: campaign.id } }),
      ).toBe(1);
      expect(enqueueApplicationJob).not.toHaveBeenCalled();
      expect(runPaidStructuredCall).not.toHaveBeenCalled();
      expect(outreachConfig.labels.saveMessage).toBe("Save");
    } finally {
      for (const id of orgIds) {
        await prisma.organization.delete({ where: { id } }).catch(() => undefined);
      }
      await prisma.$disconnect();
    }
  });
});

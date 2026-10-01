// @vitest-environment happy-dom
/**
 * Send Outreach: the role dropdown follows the selected contact, message
 * paragraphs stay separated, and each contact status renders once.
 */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { composeOutreachText } from "@/lib/application-assets/contract";
import { outreachEmailHandoff } from "@/lib/application-assets/handoff";

const updateApplicationContactRoleAction = vi.hoisted(() =>
  vi.fn<
    (
      prev: { ok: boolean; message: string } | null,
      formData: FormData,
    ) => Promise<{ ok: boolean; message: string }>
  >(async () => ({ ok: true, message: "Hiring Team role updated." })),
);
const enqueueApplicationJob = vi.hoisted(() => vi.fn());
const runPaidStructuredCall = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions/application-outreach", () => ({
  addApplicationContactAction: vi.fn(async () => ({ ok: true, message: "" })),
  updateApplicationContactRoleAction: (
    prev: { ok: boolean; message: string } | null,
    formData: FormData,
  ) => updateApplicationContactRoleAction(prev, formData),
  generateOutreachAssetAction: vi.fn(async () => ({ ok: true, message: "" })),
  buildOutreachPersonaThenGenerateAction: vi.fn(async () => ({
    ok: true,
    message: "",
  })),
  markOutreachSentAction: vi.fn(async () => ({ ok: true, message: "" })),
  markApplicationAppliedAction: vi.fn(async () => ({ ok: true, message: "" })),
  setApplicationProgressAction: vi.fn(async () => ({ ok: true, message: "" })),
}));

vi.mock("@/lib/application-jobs/service", () => ({
  enqueueApplicationJob: (...args: unknown[]) => enqueueApplicationJob(...args),
}));

vi.mock("@/lib/ai/paid-call-gate", () => ({
  runPaidStructuredCall: (...args: unknown[]) => runPaidStructuredCall(...args),
}));

import { ApplicationOutreachSection } from "@/components/ApplicationOutreachSections";

const support = [{ sourceId: "profile:name", quote: "Alex" }];

const emailContent = {
  type: "EMAIL" as const,
  subject: "Introduction",
  greeting: "Hello,",
  paragraphs: [
    { id: "p1", text: "First paragraph.", supports: support },
    { id: "p2", text: "Second paragraph.", supports: support },
  ],
  signoff: "Best,",
  signerName: "Alex Chen",
};

const inmailContent = {
  type: "LINKEDIN_INMAIL" as const,
  subject: "Introduction",
  greeting: "Hello,",
  paragraphs: [
    { id: "p1", text: "First paragraph.", supports: support },
    { id: "p2", text: "Second paragraph.", supports: support },
  ],
};

function contact(input: {
  contactId: string;
  firstName: string;
  personaId: string;
  personaName: string;
}) {
  return {
    contactId: input.contactId,
    firstName: input.firstName,
    lastName: "Example",
    title: "Director",
    email: `${input.firstName.toLowerCase()}@example.test`,
    linkedinUrl: "https://www.linkedin.com/in/example",
    personaId: input.personaId,
    personaName: input.personaName,
    roleConfirmed: true,
    linkedInProfileText: null,
    extractedTitle: null,
    individualStatus: null,
    individualError: null,
    commonGround: [],
    caresAbout: [],
  };
}

function asset(input: {
  id: string;
  contactId: string;
  type?: "EMAIL" | "LINKEDIN_INMAIL";
  content?: unknown;
  sentAt?: string | null;
}) {
  return {
    id: input.id,
    type: input.type ?? "EMAIL",
    version: 1,
    status: input.sentAt ? ("APPROVED" as const) : ("DRAFT" as const),
    personaId: "role_tap",
    contactId: input.contactId,
    purpose: "PROACTIVE" as const,
    sentAt: input.sentAt ?? null,
    createdAt: input.sentAt ? "2026-09-20T12:00:00.000Z" : "2026-09-29T12:00:00.000Z",
    emailLength: "MEDIUM" as const,
    content: input.content ?? emailContent,
  };
}

const roles = [
  {
    id: "role_tap",
    name: "Talent Acquisition Partner",
    suggestionKey: "talent_acquisition",
    personaBuilt: true,
  },
  {
    id: "role_hm",
    name: "Hiring Manager",
    suggestionKey: "hiring_manager",
    personaBuilt: true,
  },
];

const christina = contact({
  contactId: "contact_christina",
  firstName: "Christina",
  personaId: "role_tap",
  personaName: "Talent Acquisition Partner",
});
const maroney = contact({
  contactId: "contact_maroney",
  firstName: "Test",
  personaId: "role_hm",
  personaName: "Hiring Manager",
});

function mount(node: ReactNode): { host: HTMLElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { host, root };
}

function typeInto(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickContact(host: HTMLElement, contactId: string) {
  const button = host.querySelector(
    `[data-testid='outreach-contact-${contactId}'] button`,
  ) as HTMLButtonElement;
  act(() => {
    button.click();
  });
}

function section(assets: ReturnType<typeof asset>[] = []) {
  return createElement(ApplicationOutreachSection, {
    campaignId: "camp_1",
    canEdit: true,
    roles,
    contacts: [christina, maroney],
    assets,
    approvedResumeId: null,
  });
}

function decodedBody(href: string): string {
  const query = href.slice(href.indexOf("?") + 1);
  return new URLSearchParams(query).get("body") ?? "";
}

describe("Send Outreach role, spacing, and status", () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    document.body.innerHTML = "";
    updateApplicationContactRoleAction.mockClear();
    enqueueApplicationJob.mockClear();
    runPaidStructuredCall.mockClear();
  });

  it("shows the selected contact's stored role and saves only that contact", async () => {
    const view = mount(
      section([
        asset({ id: "asset_christina", contactId: christina.contactId }),
        asset({ id: "asset_maroney", contactId: maroney.contactId }),
      ]),
    );
    root = view.root;
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();

    const first = view.host.querySelector(
      "[data-testid='outreach-role-select']",
    ) as HTMLSelectElement;
    expect(first.value).toBe("role_tap");

    clickContact(view.host, maroney.contactId);
    const second = view.host.querySelector(
      "[data-testid='outreach-role-select']",
    ) as HTMLSelectElement;
    expect(second.value).toBe("role_hm");
    expect(second.selectedOptions[0]?.textContent).toBe("Hiring Manager");

    const form = view.host.querySelector(
      "[data-testid='outreach-save-role']",
    ) as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
    const saved = updateApplicationContactRoleAction.mock.calls[0]?.[1] as FormData;
    expect(saved.get("contactId")).toBe(maroney.contactId);
    expect(saved.get("personaId")).toBe("role_hm");
    expect(saved.get("contactId")).not.toBe(christina.contactId);

    clickContact(view.host, christina.contactId);
    const back = view.host.querySelector(
      "[data-testid='outreach-role-select']",
    ) as HTMLSelectElement;
    expect(back.value).toBe("role_tap");
    expect(back.selectedOptions[0]?.textContent).toBe("Talent Acquisition Partner");

    const prompt = view.host.querySelector(
      "[data-testid='outreach-generator-prompt']",
    ) as HTMLTextAreaElement;
    act(() => {
      typeInto(prompt, "Mention the portfolio.");
    });
    const instruction = view.host.querySelector(
      `[data-testid='outreach-regenerate-instruction-${"asset_christina"}']`,
    ) as HTMLTextAreaElement;
    act(() => {
      typeInto(instruction, "Make it shorter.");
    });
    clickContact(view.host, maroney.contactId);
    expect(
      (view.host.querySelector(
        "[data-testid='outreach-generator-prompt']",
      ) as HTMLTextAreaElement).value,
    ).toBe("");
    expect(
      (view.host.querySelector(
        "[data-testid='outreach-regenerate-instruction-asset_maroney']",
      ) as HTMLTextAreaElement).value,
    ).toBe("");
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();
  });

  it("separates paragraphs with a blank line on screen and in every handoff", () => {
    const composed = composeOutreachText(emailContent);
    expect(composed.body).toBe(
      "Hello,\n\nFirst paragraph.\n\nSecond paragraph.\n\nBest,\nAlex Chen",
    );
    expect(composed.body.startsWith("Hello,\n\n")).toBe(true);
    expect(composed.body.endsWith("Best,\nAlex Chen")).toBe(true);
    expect(composed.body).not.toContain("Best,\n\nAlex Chen");

    const view = mount(
      section([
        asset({
          id: "asset_email",
          contactId: christina.contactId,
          content: emailContent,
        }),
        asset({
          id: "asset_inmail",
          contactId: maroney.contactId,
          type: "LINKEDIN_INMAIL",
          content: inmailContent,
        }),
      ]),
    );
    root = view.root;
    const emailPre = view.host.querySelector(
      "[data-testid='outreach-message'] pre",
    );
    expect(emailPre?.textContent).toBe(composed.body);

    const handoff = outreachEmailHandoff({
      to: christina.email ?? "",
      subject: composed.subject ?? "",
      body: composed.body,
    });
    for (const href of [
      handoff.outlookWeb.href,
      handoff.outlookDesktop.href,
      handoff.gmailWeb.href,
    ]) {
      expect(href).toBeTruthy();
      const body = decodedBody(href ?? "");
      expect(body).toContain("Hello,\r\n\r\n");
      expect(body).toContain("First paragraph.\r\n\r\nSecond paragraph.");
      expect(body).toContain("Best,\r\nAlex Chen");
      expect(body).not.toContain("Best,\r\n\r\nAlex Chen");
    }

    clickContact(view.host, maroney.contactId);
    const linkedIn = composeOutreachText(inmailContent);
    expect(linkedIn.body).toBe("Hello,\n\nFirst paragraph.\n\nSecond paragraph.");
    expect(
      view.host.querySelector("[data-testid='outreach-message'] pre")?.textContent,
    ).toBe(linkedIn.body);
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();
  });

  it("shows each contact status once", () => {
    const view = mount(
      section([
        asset({ id: "asset_christina", contactId: christina.contactId }),
        asset({
          id: "asset_maroney_sent",
          contactId: maroney.contactId,
          sentAt: "2026-09-20T12:00:00.000Z",
        }),
        asset({
          id: "asset_maroney_draft",
          contactId: maroney.contactId,
          content: emailContent,
        }),
      ]),
    );
    root = view.root;
    const christinaRow = view.host.querySelector(
      "[data-testid='outreach-contact-contact_christina']",
    );
    expect(christinaRow?.textContent?.match(/Email ready/g)).toHaveLength(1);
    expect(
      christinaRow?.querySelector(
        "[data-testid='outreach-contact-ready-contact_christina']",
      ),
    ).toBeTruthy();
    expect(
      christinaRow?.querySelector(
        "[data-testid='outreach-contact-status-contact_christina']",
      ),
    ).toBeNull();

    const maroneyRow = view.host.querySelector(
      "[data-testid='outreach-contact-contact_maroney']",
    );
    expect(maroneyRow?.textContent?.match(/Email ready/g)).toHaveLength(1);
    expect(maroneyRow?.textContent).toContain("Email");
    expect(maroneyRow?.querySelectorAll("[data-testid^='outreach-history-']")).toHaveLength(1);
    expect(enqueueApplicationJob).not.toHaveBeenCalled();
    expect(runPaidStructuredCall).not.toHaveBeenCalled();
  });
});

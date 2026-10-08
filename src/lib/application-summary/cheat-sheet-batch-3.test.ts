// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const personaFind = vi.hoisted(() => vi.fn());
const personaUpdate = vi.hoisted(() => vi.fn(async () => ({ id: "p-1" })));
const summaryFind = vi.hoisted(() => vi.fn());
const summaryUpdate = vi.hoisted(() => vi.fn());
const addRole = vi.hoisted(() => vi.fn(async () => ({ ok: true, message: "Added" })));
const generateStructured = vi.hoisted(() => vi.fn());
const runPaid = vi.hoisted(() => vi.fn());
const enqueueJob = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

vi.mock("@/lib/prisma-client", () => ({
  prisma: {
    persona: { findFirst: personaFind, update: personaUpdate },
    applicationSummary: { findFirst: summaryFind, update: summaryUpdate },
  },
}));

vi.mock("@/lib/ai/paid-call-gate", () => ({
  runPaidStructuredCall: runPaid,
}));

vi.mock("@/lib/ai", () => ({
  getPersonaAiProvider: () => ({ generateStructured }),
  isPersonaAiConfigured: () => false,
}));

vi.mock("@/lib/application-jobs/service", () => ({
  enqueueApplicationJob: enqueueJob,
}));

vi.mock("@/app/actions/hiring-team", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/actions/hiring-team")>();
  return {
    ...actual,
    addApplicationRoleAction: addRole,
    removePersonaFromCheatSheetAction: async (
      prev: unknown,
      formData: FormData,
    ) => {
      const { removePersonaFromCheatSheet } = await import(
        "@/lib/application-summary/persona-cheat-sheet"
      );
      await removePersonaFromCheatSheet({
        organizationId: "org-1",
        campaignId: String(formData.get("campaignId") ?? ""),
        personaId: String(formData.get("personaId") ?? ""),
      });
      return { ok: true, message: "Remove from Interview Preparation Guides" };
    },
  };
});

import { AddPersonaSection } from "@/components/AddPersonaSection";
import { CheatSheetPrintBanner, CheatSheetSection } from "@/components/CheatSheetCollapsible";
import { CheatSheetPersonBody, RefreshLikelyQuestionsButton } from "@/components/CheatSheetPersonBody";
import { HiringTeamAssumptionNotice } from "@/components/HiringTeamAssumptionNotice";
import { HiringTeamCheatSheetToggle } from "@/components/HiringTeamCheatSheetControls";
import { HarperDraftProvider } from "@/components/HarperDraftStore";
import { cheatSheetPersonSectionSchema } from "@/lib/application-summary/contract";
import { addPersonaToCheatSheet } from "@/lib/application-summary/persona-cheat-sheet";
import { applicationSummaryConfig, hiringTeamConfig, vocab } from "@/lib/product-config";
import { workspaceProgressText } from "@/lib/product-config/workspace-jobs";

function mount(node: ReactNode): HTMLElement {
  const host = document.createElement("div");
  host.className = "application-summary";
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  act(() => {
    root.render(createElement(HarperDraftProvider, null, node));
  });
  return host;
}

function section(contactId: string | null) {
  return cheatSheetPersonSectionSchema.parse({
    sectionKey: contactId ? `contact:${contactId}` : "persona:p-1",
    roleId: "p-1",
    contactId,
    heading: contactId ? "Alex Rivera" : "Executive Sales Sponsor",
    sectionKind: "EXECUTIVE",
    caresAbout: [{ text: "The executive relationship" }],
    positioningStatements: [{ text: "Own the sponsor conversation" }],
    keyStatements: [{ text: "Start with the business outcome" }],
    likelyQuestions: [
      { id: "q-kept", prompt: "How do you earn an executive sponsor?" },
      { id: "q-open", prompt: "What would you ask the board?" },
    ],
    questionsToAsk: [
      { text: "What does success look like in this role?", followUps: ["Ask about the first quarter"] },
      { text: "Who else should I understand?" },
    ],
  });
}

function header(contactId: string | null) {
  const sectionKey = contactId ? `contact:${contactId}` : "persona:p-1";
  return createElement(
    CheatSheetSection,
    {
      id: sectionKey,
      title: contactId ? "Alex Rivera" : "Executive Sales Sponsor",
      headerAside: createElement(
        "span",
        { className: "contents" },
        createElement(RefreshLikelyQuestionsButton, { campaignId: "camp-1", sectionKey }),
        contactId
          ? null
          : createElement(HiringTeamCheatSheetToggle, {
              campaignId: "camp-1",
              personaId: "p-1",
              added: true,
            }),
      ),
    },
    createElement(CheatSheetPersonBody, {
      campaignId: "camp-1",
      canEdit: true,
      sectionKey,
      section: section(contactId),
      notes: [],
      personaBuilt: true,
      personaId: "p-1",
      coachQaItems: [
        {
          questionTurnId: "turn-kept",
          targetKey: "cheatSheet:q-kept",
          question: "How do you earn an executive sponsor?",
          followUp: null,
          seekerAnswers: [],
          statements: [],
          resumeBullet: null,
          talkingPoint: {
            id: "st-1",
            turnId: "turn-kept",
            kind: "INTERVIEW_ANSWER",
            status: "APPROVED",
            content: "I start with the outcome they own.",
            strengtheningNote: null,
          },
        },
      ],
    }),
  );
}

function printClone(host: HTMLElement, sectionId?: string): HTMLElement {
  const clone = host.cloneNode(true) as HTMLElement;
  if (sectionId) {
    clone.querySelectorAll(".application-summary-section").forEach((node) => {
      if (node.getAttribute("data-print-id") !== sectionId) node.remove();
    });
  }
  clone.querySelectorAll("*").forEach((node) => {
    const element = node as HTMLElement;
    const className = String(element.className ?? "");
    if (className.includes("print:hidden") || className.includes("consultation-question-screen")) {
      element.remove();
    }
  });
  clone.querySelectorAll("[data-cheat-sheet-indicator], form, a").forEach((node) => node.remove());
  clone.querySelectorAll("button").forEach((node) => {
    if (!String(node.className).includes("cheat-sheet-collapsible-heading")) node.remove();
  });
  return clone;
}

function printText(host: HTMLElement, sectionId?: string): string {
  return (printClone(host, sectionId).textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("cheat sheet batch 3", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    personaFind.mockReset();
    personaUpdate.mockClear();
    summaryFind.mockReset();
    summaryUpdate.mockClear();
    addRole.mockClear();
    runPaid.mockClear();
    enqueueJob.mockClear();
    generateStructured.mockClear();
  });

  it("removes a persona card from the cheat sheet and keeps its stored section", async () => {
    const persona = mount(header(null));
    const labels = [...persona.querySelectorAll("button")].map((node) => node.textContent ?? "");
    const printAt = labels.indexOf("Print this section");
    const refreshAt = labels.indexOf("Refresh likely questions");
    const removeAt = labels.indexOf("Remove from Interview Preparation Guides");
    expect(printAt).toBeGreaterThanOrEqual(0);
    expect(printAt).toBeLessThan(refreshAt);
    expect(refreshAt).toBeLessThan(removeAt);

    const person = mount(header("c-1"));
    expect(person.textContent).not.toContain("Remove from Interview Preparation Guides");
    expect(person.textContent).toContain("Print this section");
    expect(person.textContent).toContain("Refresh likely questions");

    const stored = section(null);
    summaryFind.mockResolvedValue({ guidanceJson: { people: [stored] } });
    personaFind.mockResolvedValue({ id: "p-1" });
    const form = persona.querySelector("form[data-testid='remove-cheat-sheet-p-1']") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
    expect(personaUpdate).toHaveBeenCalledWith({
      where: { id: "p-1" },
      data: { cheatSheetActivatedAt: null },
    });
    expect(summaryUpdate).not.toHaveBeenCalled();
    expect(stored.likelyQuestions.map((item) => item.id)).toEqual(["q-kept", "q-open"]);

    const again = await addPersonaToCheatSheet({
      organizationId: "org-1",
      campaignId: "camp-1",
      personaId: "p-1",
      userId: "user-1",
    });
    expect(again).toEqual({ kind: "stored", jobId: null });
    expect(runPaid).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(generateStructured).not.toHaveBeenCalled();
    const page = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    expect(page).toContain("!person.contactId");
    expect(page).toContain("HiringTeamCheatSheetToggle");
    expect(page).not.toContain("runPaidStructuredCall");
    expect(page).not.toContain("enqueueApplicationJob");
  });

  it("prints likely questions and questions to ask for a section and the whole page", () => {
    const host = mount(
      createElement(
        "div",
        null,
        createElement(CheatSheetPrintBanner),
        header(null),
        header("c-1"),
      ),
    );
    const css = readFileSync("src/app/globals.css", "utf8");
    const shell = readFileSync("src/components/AppShell.tsx", "utf8");
    expect(css).toContain(".cheat-sheet-collapsible-body.hidden");
    expect(css).toContain("[data-cheat-sheet-indicator]");
    expect(css).toContain("overflow: visible !important");
    expect(shell).toContain("print:overflow-visible");
    const page = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    expect(page).toContain('body[data-print-section] .application-summary-section');
    expect(page).toContain("CheatSheetPrintButton");

    for (const printed of [printText(host), printText(host, "persona:p-1")]) {
      expect(printed.startsWith("Approved answers only.")).toBe(true);
      expect(printed).toContain("How do you earn an executive sponsor?");
      expect(printed).toContain("I start with the outcome they own.");
      expect(printed).toContain("What would you ask the board?");
      expect(printed).toContain("What does success look like in this role?");
      expect(printed).toContain("Who else should I understand?");
      expect(printed).not.toContain("Ask about the first quarter");
      expect(printed).not.toContain("Follow-up questions");
      expect(printed).not.toContain("▶");
      expect(printed).not.toContain("▼");
      expect(printed).not.toContain("Print this section");
      expect(printed).not.toContain("Refresh likely questions");
      expect(printed).not.toContain("Remove from Interview Preparation Guides");
      expect(printed.replace("Approved answers only.", "")).not.toContain("Approved");
    }
    const personaPrint = printClone(host, "persona:p-1");
    expect(personaPrint.textContent).not.toContain("Alex Rivera");
    expect(css).toContain('[data-testid="cheat-sheet-coach-items"] > li');
    expect(css).toContain("border: 0 !important");
    expect(personaPrint.querySelector("[data-testid='questions-to-ask-print']")?.querySelector("button")).toBeNull();
    expect(host.querySelector("[data-cheat-sheet-open='false']")).not.toBeNull();
  });

  it("puts the notice first and collapses the add-persona form after saving", async () => {
    const notice = mount(createElement(HiringTeamAssumptionNotice));
    expect(notice.textContent).toBe(hiringTeamConfig.assumptionIntro);
    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    const pageStart = workspace.indexOf("{asPage ? <HiringTeamAssumptionNotice /> : null}");
    const heading = workspace.indexOf("{hiringTeamConfig.workspaceTitle}", pageStart);
    expect(pageStart).toBeGreaterThan(0);
    expect(heading).toBeGreaterThan(pageStart);

    const form = mount(createElement(AddPersonaSection, { campaignId: "camp-1" }));
    expect(form.querySelector("[data-testid='add-persona-section']")?.getAttribute("data-open")).toBe(
      "false",
    );
    expect(form.querySelector("[data-testid='add-persona-body']")).toBeNull();
    const toggle = form.querySelector("[data-testid='add-persona-toggle']") as HTMLButtonElement;
    await act(async () => {
      toggle.click();
    });
    expect(form.textContent).toContain("Add a new persona");
    expect(form.textContent).toContain("Saved templates are added only when you choose one.");
    const name = form.querySelector("input[name='name']") as HTMLInputElement;
    name.value = "Channel leader";
    const submit = [...form.querySelectorAll("button")].find((node) => node.textContent === "Add persona");
    expect(submit).toBeTruthy();
    await act(async () => {
      submit?.closest("form")?.requestSubmit();
    });
    expect(addRole).toHaveBeenCalled();
    expect(form.querySelector("[data-testid='add-persona-section']")?.getAttribute("data-open")).toBe(
      "false",
    );
    expect(runPaid).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("names every single-persona build control and leaves the excluded controls", () => {
    expect(hiringTeamConfig.actions.build).toBe("Generate persona research");
    expect(hiringTeamConfig.queuedBuild).toBe("Researching this persona…");
    expect(workspaceProgressText("HIRING_TEAM_BUILD", "Executive Sales Sponsor")).toBe(
      "Researching this persona…",
    );
    const unbuilt = mount(
      createElement(CheatSheetPersonBody, {
        campaignId: "camp-1",
        canEdit: true,
        sectionKey: "persona:p-1",
        section: null,
        notes: [],
        personaBuilt: false,
        personaId: "p-1",
      }),
    );
    const button = unbuilt.querySelector("button");
    expect(button?.textContent).toBe("Generate persona research");
    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    const section = workspace.slice(
      workspace.indexOf("async function HiringTeamSection"),
      workspace.indexOf("function AnnotatedBlock"),
    );
    expect(section).not.toContain("submitLabel={hiringTeamConfig.actions.build}");
    expect(section).not.toContain("hiringTeamConfig.actions.buildAllDirect");
    const harper = readFileSync("src/components/HarperPersonView.tsx", "utf8");
    expect(harper).toContain("CheatSheetPersonBody");
    expect(applicationSummaryConfig.actions.generateSection).toBe("Generate");
    expect(applicationSummaryConfig.actions.refreshLikelyQuestions).toBe("Refresh likely questions");
    expect(hiringTeamConfig.actions.addToCheatSheet).toBe("Add to Interview Preparation Guides");
    expect(hiringTeamConfig.actions.removeFromCheatSheet).toBe("Remove from Interview Preparation Guides");
    expect(hiringTeamConfig.actions.buildAllDirect).toBe("Generate all Direct roles");
    expect(vocab.persona.singular).toBe("Hiring Team role");
    expect(applicationSummaryConfig.actions.buildPersonaNow).toBe("Yes");
    const summary = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    expect(summary).not.toContain("runPaidStructuredCall");
    expect(summary).not.toContain("enqueueApplicationJob");
    expect(runPaid).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});

// @vitest-environment happy-dom
/**
 * New interview: shared build, title match, and the dashboard form.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENTERPRISE_SALES_DIRECTOR_POSTING,
  NURSE_MANAGER_POSTING,
} from "@/lib/job-requirement/fixtures";
import {
  CREATE_ROLE_FROM_TITLE,
  matchingHiringTeamRoles,
} from "@/lib/application/role-title-match";
import {
  cheatSheetPersonSectionInputHash,
  guideHeadingUpgrade,
  isTitleOnlyPrepGuide,
} from "@/lib/application-summary/people";
import {
  interviewDisplayName,
  interviewScheduleIsComplete,
  interviewStageTypeForRole,
} from "@/lib/interview/new-interview";
import { DEFAULT_INTERVIEW_STAGE_TYPE, prepGuideReadyMessage } from "@/lib/product-config";

const salesTitle = ENTERPRISE_SALES_DIRECTOR_POSTING.split("\n")[0]!;
const nursingTitle = NURSE_MANAGER_POSTING.split("\n")[0]!;
const newGraduateTitle = "Junior Analyst";

const roles = [
  {
    id: "sales",
    name: "Enterprise Sales Director",
    suggestionKey: null,
    targetTitles: [salesTitle],
  },
  {
    id: "nursing",
    name: "Nurse Manager",
    suggestionKey: null,
    targetTitles: [nursingTitle],
  },
  {
    id: "grad",
    name: "New Graduate",
    suggestionKey: null,
    targetTitles: [newGraduateTitle],
  },
];

const mocks = {
  findMany: vi.fn(async (args?: unknown) => {
    void args;
    return [] as unknown;
  }),
  updateMany: vi.fn(async (args?: unknown) => {
    void args;
    return { count: 1 };
  }),
  addContact: vi.fn(async (args?: unknown) => {
    void args;
    return {} as unknown;
  }),
  addRole: vi.fn(async (args?: unknown) => {
    void args;
    return {} as unknown;
  }),
  createStage: vi.fn(async (args?: unknown) => {
    void args;
    return {} as unknown;
  }),
  queueGuide: vi.fn(async (args?: unknown) => {
    void args;
    return {} as unknown;
  }),
  paid: vi.fn(async (args?: unknown) => {
    void args;
    return {} as unknown;
  }),
};

const action = vi.fn();

vi.mock("@/lib/prisma-client", () => ({
  prisma: {
    persona: {
      findMany: (args: unknown) => mocks.findMany(args),
    },
    campaignContact: {
      updateMany: (args: unknown) => mocks.updateMany(args),
    },
  },
}));

vi.mock("@/lib/application/contacts", () => ({
  addApplicationContact: (args: unknown) => mocks.addContact(args),
}));

vi.mock("@/lib/hiring-team/build", () => ({
  addApplicationHiringTeamRole: (args: unknown) => mocks.addRole(args),
}));

vi.mock("@/lib/interview/stages", () => ({
  createInterviewStage: (args: unknown) => mocks.createStage(args),
}));

vi.mock("@/lib/interview/prep-guide", () => ({
  queueInterviewPrepGuide: (args: unknown) => mocks.queueGuide(args),
}));

vi.mock("@/lib/ai/paid-call-gate", () => ({
  runPaidStructuredCall: (args: unknown) => mocks.paid(args),
}));

vi.mock("@/app/actions/interview", () => ({
  buildNewInterviewAction: (previous: null, formData: FormData) =>
    action(previous, formData),
}));

vi.mock("next/link", () => ({
  default: (props: { href: string; children: ReactNode; "data-testid"?: string }) =>
    createElement("a", { href: props.href, "data-testid": props["data-testid"] }, props.children),
}));

import { buildNewInterviewPrep } from "@/lib/interview/new-interview";
import { NewInterviewForm } from "@/components/NewInterviewForm";

function functionSource(file: string, name: string): string {
  const source = readFileSync(join(process.cwd(), file), "utf8");
  const start = source.indexOf(`export async function ${name}`);
  if (start < 0) throw new Error(`Missing ${name}`);
  const next = source.indexOf("\nexport ", start + name.length);
  return source.slice(start, next === -1 ? undefined : next);
}

function hashFor(heading: string): string {
  return cheatSheetPersonSectionInputHash({
    person: {
      sectionKey: "contact:ada",
      roleId: "nursing",
      contactId: "ada",
      heading,
      roleName: "Nurse Manager",
      titles: [nursingTitle],
      sectionKind: "HIRING_MANAGER",
    },
    sources: [],
    careerStage: "college_graduate",
    interviewer: null,
  });
}

const base = {
  organizationId: "org",
  campaignId: "camp",
  userId: "user",
  title: salesTitle,
  name: "Ada Lovelace",
  scheduledAt: "2026-10-08T15:00",
  format: "VIDEO",
};

describe("new interview build", () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
    mocks.updateMany.mockClear();
    mocks.addContact.mockReset();
    mocks.addRole.mockReset();
    mocks.createStage.mockReset();
    mocks.queueGuide.mockReset();
    mocks.paid.mockReset();
    mocks.findMany.mockResolvedValue(roles);
    mocks.addContact.mockResolvedValue({
      contactId: "contact-1",
      campaignContactId: "membership-1",
      personaId: "sales",
      decision: {},
    });
    mocks.addRole.mockResolvedValue({ personaId: "created-role" });
    mocks.createStage.mockResolvedValue({ id: "stage-1" });
    mocks.queueGuide.mockResolvedValue({
      jobId: "job-1",
      unchanged: false,
      needsPersonaChoice: false,
    });
  });

  it("matches sales, nursing, and new-graduate titles to those roles", () => {
    expect(matchingHiringTeamRoles({ title: salesTitle, roles }).map((role) => role.id)).toEqual([
      "sales",
    ]);
    expect(matchingHiringTeamRoles({ title: nursingTitle, roles }).map((role) => role.id)).toEqual([
      "nursing",
    ]);
    expect(
      matchingHiringTeamRoles({ title: newGraduateTitle, roles }).map((role) => role.id),
    ).toEqual(["grad"]);
    expect(matchingHiringTeamRoles({ title: "Zebra Keeper", roles })).toEqual([]);
  });

  it("saves a title-only contact and queues its guide without an interview", async () => {
    const result = await buildNewInterviewPrep({
      ...base,
      name: "",
      scheduledAt: "",
      format: "",
    });
    expect(mocks.addContact).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: "",
        lastName: "",
        title: salesTitle,
        personaId: "sales",
      }),
    );
    expect(mocks.createStage).not.toHaveBeenCalled();
    expect(mocks.queueGuide).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "contact-1", personaId: "sales" }),
    );
    expect(result.sectionKey).toBe("contact:contact-1");
    expect(result.displayName).toBe(salesTitle);
    expect(result.stageId).toBeNull();
    expect(isTitleOnlyPrepGuide({ contactId: "contact-1", contactName: null })).toBe(true);
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("saves a named contact for Interview Personas and creates the interview only when date, time, and format are given", async () => {
    const named = await buildNewInterviewPrep(base);
    expect(named.displayName).toBe("Ada Lovelace");
    expect(isTitleOnlyPrepGuide({ contactId: "contact-1", contactName: "Ada Lovelace" })).toBe(
      false,
    );
    expect(mocks.createStage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "OTHER",
        format: "VIDEO",
        interviewerContactIds: ["contact-1"],
      }),
    );
    expect(interviewStageTypeForRole({ roleName: "Nurse Manager", title: nursingTitle })).toBe(
      "OTHER",
    );
    expect(
      interviewStageTypeForRole({ roleName: "New Graduate", title: newGraduateTitle }),
    ).toBe("OTHER");
    expect(
      interviewStageTypeForRole({
        roleName: "Talent Acquisition Partner",
        title: "Coordinator",
      }),
    ).toBe("RECRUITER_SCREEN");
    expect(
      interviewStageTypeForRole({ roleName: "Hiring Manager", title: "Senior Recruiter" }),
    ).toBe("RECRUITER_SCREEN");
    expect(DEFAULT_INTERVIEW_STAGE_TYPE).toBe("RECRUITER_SCREEN");

    mocks.createStage.mockClear();
    mocks.findMany.mockResolvedValue([
      {
        id: "ta",
        name: "Talent Acquisition Partner",
        suggestionKey: "recruiter",
        targetTitles: ["Coordinator"],
      },
    ]);
    await buildNewInterviewPrep({
      ...base,
      title: "Coordinator",
      name: "Grace Hopper",
      personaId: "ta",
    });
    expect(mocks.createStage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "RECRUITER_SCREEN" }),
    );

    mocks.createStage.mockClear();
    mocks.addContact.mockClear();
    mocks.findMany.mockResolvedValue(roles);
    await buildNewInterviewPrep({ ...base, name: "Grace Hopper", format: "" });
    expect(mocks.createStage).not.toHaveBeenCalled();
    await buildNewInterviewPrep({ ...base, name: "Grace Hopper 2", scheduledAt: "" });
    expect(mocks.createStage).not.toHaveBeenCalled();
    expect(interviewScheduleIsComplete({ scheduledAt: "2026-10-08T15:00", format: "VIDEO" })).toBe(
      true,
    );
  });

  it("creates a role from the title with no model call when nothing matches", async () => {
    const writer = functionSource(
      "src/lib/hiring-team/build.ts",
      "addApplicationHiringTeamRole",
    );
    expect(writer).toContain("persona.create");
    expect(writer).not.toContain("runPaidStructuredCall");
    expect(writer).not.toContain("identifyRolesWithModel");
    expect(writer).not.toContain("synthesizeHiringTeamRole");

    await buildNewInterviewPrep({
      ...base,
      title: "Zebra Keeper",
      name: "",
      scheduledAt: "",
      format: "",
      personaId: CREATE_ROLE_FROM_TITLE,
    });
    expect(mocks.addRole).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Zebra Keeper",
        likelyTitles: ["Zebra Keeper"],
      }),
    );
    expect(mocks.addContact).toHaveBeenCalledWith(
      expect.objectContaining({ personaId: "created-role", title: "Zebra Keeper" }),
    );
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("a double click creates one contact, one interview, and one guide", async () => {
    const [a, b] = await Promise.all([
      buildNewInterviewPrep(base),
      buildNewInterviewPrep(base),
    ]);
    expect(a.contactId).toBe(b.contactId);
    expect(mocks.addContact).toHaveBeenCalledTimes(1);
    expect(mocks.createStage).toHaveBeenCalledTimes(1);
    expect(mocks.queueGuide).toHaveBeenCalledTimes(1);
  });

  it("moves a title-only guide onto the name without a paid call", () => {
    const previous = hashFor(nursingTitle);
    const upgrade = guideHeadingUpgrade({
      storedHeading: nursingTitle,
      storedInputHash: previous,
      nextHeading: "Ada Lovelace",
      hashFor,
    });
    expect(upgrade).toEqual({
      heading: "Ada Lovelace",
      inputHash: hashFor("Ada Lovelace"),
    });
    expect(
      guideHeadingUpgrade({
        storedHeading: nursingTitle,
        storedInputHash: "different-inputs",
        nextHeading: "Ada Lovelace",
        hashFor,
      }),
    ).toBeNull();
    const keeper = functionSource(
      "src/lib/application-summary/service.ts",
      "keepGuideWhenOnlyTheNameChanged",
    );
    expect(keeper).toContain("guideHeadingUpgrade");
    expect(keeper).not.toContain("runPaidStructuredCall");
    expect(keeper).not.toContain("enqueueApplicationJob");
    expect(keeper).not.toContain("queueInterviewPrepGuide");
    expect(interviewDisplayName({ name: "", title: nursingTitle })).toBe(nursingTitle);
    expect(prepGuideReadyMessage("Ada Lovelace")).toBe(
      "Your prep guide for Ada Lovelace is ready",
    );
  });
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

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function RefreshHarness() {
  const [tick, setTick] = useState(0);
  return createElement(
    "div",
    null,
    createElement(
      "button",
      {
        type: "button",
        "data-testid": "refresh",
        onClick: () => setTick((value) => value + 1),
      },
      "Refresh",
    ),
    createElement("span", { "data-testid": "tick" }, String(tick)),
    createElement(NewInterviewForm, { campaignId: "camp", roles }),
  );
}

describe("new interview form", () => {
  let root: Root | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    action.mockReset();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
  });

  it("keeps typed title, name, date, and format across a refresh and offers the role dropdown when nothing matches", () => {
    const view = mount(createElement(RefreshHarness));
    root = view.root;
    expect(view.host.textContent).toContain("I have a new interview!");
    act(() => {
      (
        view.host.querySelector("[data-testid='new-interview-open']") as HTMLButtonElement
      ).click();
    });
    expect(view.host.textContent).toContain("Congratulations on making it to the next stage!");
    const form = view.host.querySelector("[data-testid='new-interview-form']") as HTMLElement;
    expect(form.className).toContain("space-y-3");
    expect(form.querySelector(".grid")?.className).toContain("grid-cols-1");
    expect(form.querySelector(".grid")?.className).toContain("sm:grid-cols-2");

    const title = view.host.querySelector("[data-testid='new-interview-title']") as HTMLInputElement;
    const person = view.host.querySelector("[data-testid='new-interview-name']") as HTMLInputElement;
    const when = view.host.querySelector("[data-testid='new-interview-when']") as HTMLInputElement;
    act(() => {
      typeInto(title, "Zebra Keeper");
      typeInto(person, "Ada Lovelace");
      typeInto(when, "2026-10-08T15:00");
    });
    const format = view.host.querySelector("[data-testid='new-interview-format']") as HTMLSelectElement;
    act(() => {
      format.value = "VIDEO";
      format.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const role = view.host.querySelector("[data-testid='new-interview-role']") as HTMLSelectElement;
    expect(role).toBeTruthy();
    expect(role.textContent).toContain("Enterprise Sales Director");
    expect(role.textContent).toContain("Nurse Manager");
    expect(role.textContent).toContain("New Graduate");
    expect(role.textContent).toContain("Create a new role from this title");

    act(() => {
      (view.host.querySelector("[data-testid='refresh']") as HTMLButtonElement).click();
    });
    expect(view.host.querySelector("[data-testid='tick']")?.textContent).toBe("1");
    expect(
      (view.host.querySelector("[data-testid='new-interview-title']") as HTMLInputElement).value,
    ).toBe("Zebra Keeper");
    expect(
      (view.host.querySelector("[data-testid='new-interview-name']") as HTMLInputElement).value,
    ).toBe("Ada Lovelace");
    expect(
      (view.host.querySelector("[data-testid='new-interview-when']") as HTMLInputElement).value,
    ).toBe("2026-10-08T15:00");
    expect(
      (view.host.querySelector("[data-testid='new-interview-format']") as HTMLSelectElement).value,
    ).toBe("VIDEO");
    expect(view.host.textContent).not.toContain("Your prep guide");
  });

  it("shows the matched role for a nursing title and a person guide ready message", async () => {
    action.mockResolvedValue({
      ok: true,
      message: prepGuideReadyMessage("Ada Lovelace"),
      contactId: "contact-1",
      sectionKey: "contact:contact-1",
      displayName: "Ada Lovelace",
      jobId: null,
    });
    const view = mount(createElement(NewInterviewForm, { campaignId: "camp", roles }));
    root = view.root;
    act(() => {
      (
        view.host.querySelector("[data-testid='new-interview-open']") as HTMLButtonElement
      ).click();
    });
    act(() => {
      typeInto(
        view.host.querySelector("[data-testid='new-interview-title']") as HTMLInputElement,
        nursingTitle,
      );
    });
    expect(view.host.querySelector("[data-testid='new-interview-role']")).toBeNull();
    expect(view.host.textContent).toContain("Matching role: Nurse Manager");
    await act(async () => {
      (
        view.host.querySelector("[data-testid='new-interview-build']") as HTMLButtonElement
      ).click();
    });
    expect(view.host.textContent).toContain("Your prep guide for Ada Lovelace is ready");
    const link = view.host.querySelector("[data-testid='new-interview-view-guide']") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/campaigns/camp/summary#contact:contact-1");
  });

  it("disables Build my prep guide while the request is pending", async () => {
    let finish: (value: unknown) => void = () => undefined;
    action.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = mount(createElement(NewInterviewForm, { campaignId: "camp", roles }));
    root = view.root;
    act(() => {
      (
        view.host.querySelector("[data-testid='new-interview-open']") as HTMLButtonElement
      ).click();
    });
    act(() => {
      typeInto(
        view.host.querySelector("[data-testid='new-interview-title']") as HTMLInputElement,
        nursingTitle,
      );
    });
    const build = () =>
      view.host.querySelector("[data-testid='new-interview-build']") as HTMLButtonElement;
    await act(async () => {
      build().click();
    });
    expect(build().disabled).toBe(true);
    expect(view.host.textContent).toContain("Harper is preparing your guide");
    await act(async () => {
      finish({
        ok: true,
        message: prepGuideReadyMessage("Ada Lovelace"),
        contactId: "contact-1",
        sectionKey: "contact:contact-1",
        displayName: "Ada Lovelace",
        jobId: null,
      });
    });
    expect(view.host.textContent).toContain("Your prep guide for Ada Lovelace is ready");
  });
});

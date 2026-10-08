import { beforeEach, describe, expect, it, vi } from "vitest";

const prepare = vi.hoisted(() =>
  vi.fn(
    async (input: {
      organizationId: string;
      campaignId: string;
      personaId: string;
      personaBuilt: boolean;
    }) => {
      void input.personaId;
    },
  ),
);
const enqueue = vi.hoisted(() =>
  vi.fn(async (input: { type?: string }) => ({ id: input.type ? "job-outreach" : "job-outreach" })),
);
const findFirst = vi.hoisted(() =>
  vi.fn(
    async (args?: unknown): Promise<{ id: string; profileJson: unknown } | null> => {
      void args;
      return null;
    },
  ),
);
const wouldSkip = vi.hoisted(() =>
  vi.fn(async (args?: unknown) => {
    void args;
    return false;
  }),
);

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

vi.mock("@/lib/auth/authz", () => ({
  requireCurrentUser: async () => ({ id: "user-1" }),
}));

vi.mock("@/lib/tenant/getCurrentOrganization", () => ({
  requireOrganizationId: async () => "org-1",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    persona: {
      findFirst: (args?: unknown) => findFirst(args),
    },
  },
}));

vi.mock("@/lib/interview/prep-guide", () => ({
  prepareInterviewPrepGuideGeneration: prepare,
}));

vi.mock("@/lib/application-jobs/service", () => ({
  enqueueApplicationJob: enqueue,
}));

vi.mock("@/lib/application-assets/outreach", () => ({
  markApplicationApplied: vi.fn(),
  markOutreachSent: vi.fn(),
  saveOutreachMessageEdit: vi.fn(),
  outreachGenerateWouldSkip: (args?: unknown) => wouldSkip(args),
  outreachUnchangedSkipMessage: () => "No Changes To Outreach",
}));

import { generateOutreachAssetAction } from "@/app/actions/application-outreach";

function form(personaId: string): FormData {
  const data = new FormData();
  data.set("campaignId", "camp-1");
  data.set("kind", "EMAIL");
  data.set("purpose", "PROACTIVE");
  data.set("personaId", personaId);
  data.set("contactId", "contact-1");
  return data;
}

describe("outreach builds the role on the generate click", () => {
  beforeEach(() => {
    prepare.mockClear();
    enqueue.mockClear();
    findFirst.mockReset();
    wouldSkip.mockClear();
    wouldSkip.mockResolvedValue(false);
  });

  it("builds an unbuilt role once, then enqueues the message", async () => {
    findFirst.mockResolvedValue({
      id: "role-1",
      profileJson: { narrative: null },
    });
    const result = await generateOutreachAssetAction(null, form("role-1"));
    expect(result.ok).toBe(true);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith({
      organizationId: "org-1",
      campaignId: "camp-1",
      personaId: "role-1",
      personaBuilt: false,
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.[0]?.type).toBe("OUTREACH");
    expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(
      enqueue.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("does not build a role that already has a narrative", async () => {
    findFirst.mockResolvedValue({
      id: "role-1",
      profileJson: { narrative: { overview: { text: "Owns the hire." } } },
    });
    const result = await generateOutreachAssetAction(null, form("role-1"));
    expect(result.ok).toBe(true);
    expect(prepare).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.[0]?.type).toBe("OUTREACH");
  });
});

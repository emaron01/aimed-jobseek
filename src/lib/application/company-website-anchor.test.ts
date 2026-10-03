// @vitest-environment happy-dom
/**
 * Company website is required, research is anchored to it, and anchored
 * research does not ask the seeker to confirm it.
 */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { JOB_BOARD_HOSTS, applicationResearchCopy, applicationWorkspaceCopy } from "@/lib/product-config";
import {
  employerSitePrefillFromPostingUrl,
  parseEmployerWebsite,
} from "@/lib/application/company-website";
import { hasTestDatabase } from "@/test/database";
import { withTestTenant } from "@/test/with-test-tenant";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  usePathname: () => "/campaigns/new",
  useSearchParams: () => new URLSearchParams(),
  redirect: () => undefined,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

const interpretJobPosting = vi.hoisted(() => vi.fn());

vi.mock("@/lib/job-requirement/parse", () => ({
  interpretJobPosting: (...args: unknown[]) => interpretJobPosting(...args),
}));

import { NewCampaignForm } from "@/components/NewCampaignForm";
import { ScoreReportClient, type ScoreReportClientRow } from "@/components/ScoreReportClient";
import { ApplicationWorkspace } from "@/components/ApplicationWorkspace";
import { createCampaignAction } from "@/app/actions";
import {
  saveApplicationCompanyResearchNotesAction,
  saveApplicationEmployerWebsiteAction,
} from "@/app/actions/application";
import { vocab } from "@/lib/product-config";

function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function mount(node: ReactNode): { host: HTMLElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { host, root };
}

const JOB_BOARD_MESSAGE = applicationWorkspaceCopy.companyWebsiteJobBoard;

describe("company website rules", () => {
  it("prefills the posting host and keeps www", () => {
    expect(
      employerSitePrefillFromPostingUrl(
        "https://www.cscglobal.com/careers/senior-director-of-sales",
      ),
    ).toBe("https://www.cscglobal.com");
  });

  it("rejects every listed job board and its subdomains", () => {
    for (const board of JOB_BOARD_HOSTS) {
      for (const raw of [
        `https://${board}`,
        `https://www.${board}`,
        `https://jobs.${board}/opening`,
      ]) {
        const parsed = parseEmployerWebsite(raw);
        expect(parsed.ok, raw).toBe(false);
        if (!parsed.ok) expect(parsed.message).toBe(JOB_BOARD_MESSAGE);
      }
    }
    expect(employerSitePrefillFromPostingUrl("https://jobs.lever.co/acme/123")).toBeNull();
  });

  it("normalizes a company site and rejects an empty value", () => {
    const parsed = parseEmployerWebsite("https://www.cscglobal.com/about");
    expect(parsed).toEqual({
      ok: true,
      website: "https://cscglobal.com",
      domain: "cscglobal.com",
    });
    const missing = parseEmployerWebsite("  ");
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.message).toBe(applicationWorkspaceCopy.companyWebsiteRequired);
    }
  });
});

describe("company website forms", () => {
  let root: Root | null = null;

  afterAll(() => {
    act(() => {
      root?.unmount();
    });
  });

  it("requires a company website and prefills it from a company posting URL", () => {
    const view = mount(
      createElement(NewCampaignForm, {
        products: [{ id: "prod_1", name: "Profile", ready: true, omissionReason: null }],
      }),
    );
    root = view.root;
    const website = view.host.querySelector(
      "[data-testid='company-website']",
    ) as HTMLInputElement;
    const posting = view.host.querySelector(
      "input[name='postingUrl']",
    ) as HTMLInputElement;
    const submit = view.host.querySelector("button[type='submit']") as HTMLButtonElement;
    expect(website.required).toBe(true);
    expect(submit.disabled).toBe(true);

    const postingText = view.host.querySelector(
      "textarea[name='postingText']",
    ) as HTMLTextAreaElement;
    act(() => {
      typeInto(postingText, "Senior Director of Sales at CSC");
      typeInto(
        posting,
        "https://www.cscglobal.com/careers/senior-director-of-sales",
      );
    });
    expect(website.value).toBe("https://www.cscglobal.com");
    expect(submit.disabled).toBe(false);

    act(() => {
      typeInto(website, "https://www.indeed.com/viewjob");
    });
    expect(view.host.textContent).toContain(JOB_BOARD_MESSAGE);
    expect(submit.disabled).toBe(true);
  });

  it("shows the job-board message for every listed board on the create form", () => {
    const view = mount(
      createElement(NewCampaignForm, {
        products: [{ id: "prod_1", name: "Profile", ready: true, omissionReason: null }],
      }),
    );
    root = view.root;
    const website = view.host.querySelector(
      "[data-testid='company-website']",
    ) as HTMLInputElement;
    for (const board of JOB_BOARD_HOSTS) {
      act(() => {
        typeInto(website, `https://boards.${board}/jobs/1`);
      });
      expect(view.host.textContent, board).toContain(JOB_BOARD_MESSAGE);
    }
  });

  it("shows a required company website on the score-report create form", () => {
    const row: ScoreReportClientRow = {
      id: "row_1",
      contactId: "contact_1",
      overallScore: 1,
      icpScore: null,
      personaScore: null,
      companyScore: null,
      productRelevanceScore: null,
      scoreLabel: null,
      recommendedAction: null,
      companySummary: null,
      whatTheySell: null,
      estimatedAov: null,
      aovReasoning: null,
      fitStrengths: [],
      fitRisks: [],
      disqualifiers: [],
      reasoning: null,
      researchStatus: "NOT_STARTED",
      researchSources: [],
      scoringStatus: "SCORED",
      assessmentData: null,
      aiProvider: null,
      aiModel: null,
      aiModelUrlIdentifier: null,
      promptVersion: null,
      scoringLogicVersion: null,
      scoredAt: null,
      scoringError: null,
      contact: {
        id: "contact_1",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.test",
        title: "Director",
        company: "CSC",
        companyId: null,
        companyRecord: null,
      },
    };
    const view = mount(
      createElement(ScoreReportClient, {
        runId: "run_1",
        productId: "prod_1",
        icpId: "",
        personaId: null,
        productName: "Profile",
        icpName: "",
        personaName: "",
        rows: [row],
      }),
    );
    root = view.root;
    const checkbox = view.host.querySelector(
      "input[type='checkbox']",
    ) as HTMLInputElement;
    act(() => {
      checkbox.click();
    });
    const open = Array.from(view.host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes(`Create ${vocab.campaign.Singular}`),
    ) as HTMLButtonElement;
    act(() => {
      open.click();
    });
    const website = view.host.querySelector(
      "[data-testid='company-website']",
    ) as HTMLInputElement;
    expect(website).toBeTruthy();
    expect(website.required).toBe(true);
    expect(website.name).toBe("companyWebsite");
  });
});

describe.skipIf(!hasTestDatabase())("company website anchor against postgres", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let userId = "";
  let productId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    const { fixtureAlexChenProfile } = await import(
      "@/lib/product-research/fixtures/alex-chen-profile"
    );
    const { normalizeParsedJobRequirement } = await import(
      "@/lib/job-requirement/normalize"
    );
    const { NORMAL_JOB_MODEL } = await import(
      "@/lib/job-requirement/fixtures"
    );
    prisma = new PrismaClient();
    const workspace = await createIndividualWorkspace({
      email: `website-anchor-${suffix}@example.test`,
      name: "Website Anchor",
    });
    organizationId = workspace.organization.id;
    userId = workspace.user.id;
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Profile ${suffix}`,
        approvalStatus: "APPROVED",
        profileJson: fixtureAlexChenProfile() as object,
      },
    });
    productId = product.id;
    const parsed = normalizeParsedJobRequirement(
      { ...NORMAL_JOB_MODEL, companyName: `CSC ${suffix}` },
      `Senior Director of Sales at CSC ${suffix}`,
    );
    interpretJobPosting.mockResolvedValue({ data: parsed, skipped: false });

    const authz = await import("@/lib/auth/authz");
    const session = await import("@/lib/auth/session");
    const org = await import("@/lib/tenant/getCurrentOrganization");
    const ownership = await import("@/lib/work/ownership");
    vi.spyOn(authz, "requireCurrentUser").mockImplementation(async () => ({
      id: userId,
      emailVerifiedAt: new Date(),
    }) as Awaited<ReturnType<typeof authz.requireCurrentUser>>);
    vi.spyOn(session, "requireCurrentUser").mockImplementation(async () => ({
      id: userId,
      emailVerifiedAt: new Date(),
    }) as Awaited<ReturnType<typeof session.requireCurrentUser>>);
    vi.spyOn(org, "requireOrganizationId").mockImplementation(async () => organizationId);
    vi.spyOn(ownership, "getWorkActor").mockImplementation(async () => ({
      organizationId,
      userId,
      role: "OWNER",
      canViewAll: true,
    }));
  }, 60_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    await prisma?.$disconnect();
  });

  function form(entries: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) data.set(key, value);
    return data;
  }

  it("creates an application only with a company website and stores it on the company when empty", async () => {
    const missing = await withTestTenant(organizationId, () =>
      createCampaignAction(
        null,
        form({
          name: `Missing site ${suffix}`,
          postingText: "Senior Director of Sales",
          productId,
        }),
      ),
    );
    expect(missing.ok).toBe(false);
    expect(missing.fieldErrors?.companyWebsite).toBe(
      applicationWorkspaceCopy.companyWebsiteRequired,
    );

    const board = await withTestTenant(organizationId, () =>
      createCampaignAction(
        null,
        form({
          name: `Board ${suffix}`,
          postingText: "Senior Director of Sales",
          productId,
          companyWebsite: "https://acme.myworkdayjobs.com/careers",
        }),
      ),
    );
    expect(board.ok).toBe(false);
    expect(board.message).toBe(JOB_BOARD_MESSAGE);

    const created = await withTestTenant(organizationId, () =>
      createCampaignAction(
        null,
        form({
          name: `CSC ${suffix}`,
          postingText: `Senior Director of Sales at CSC ${suffix}`,
          postingUrl: "https://www.cscglobal.com/careers/senior-director-of-sales",
          companyWebsite: "https://www.cscglobal.com",
          productId,
        }),
      ),
    );
    expect(created.ok, created.message).toBe(true);
    const requirement = await prisma.jobRequirement.findFirstOrThrow({
      where: { campaignId: created.campaignId },
      include: { company: true },
    });
    expect(requirement.suppliedEmployerWebsite).toBe("https://cscglobal.com");
    expect(requirement.company?.website).toBe("https://cscglobal.com");
    expect(requirement.company?.normalizedDomain).toBe("cscglobal.com");
    const runs = await prisma.researchRun.count({
      where: { campaignId: created.campaignId },
    });
    expect(runs).toBeGreaterThan(0);
  });

  it("does not overwrite a different shared company website", async () => {
    const company = await prisma.company.create({
      data: {
        organizationId,
        name: `Kept ${suffix}`,
        normalizedName: `kept-${suffix}`,
        website: "https://kept.example",
        normalizedDomain: "kept.example",
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Conflict ${suffix}`,
        productId,
      },
    });
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        companyId: company.id,
        rawText: "Director of Sales",
        companyName: company.name,
        employerDisposition: "IDENTIFIED",
        scorecardJson: { mission: null, outcomes: [], competencies: [] },
      },
    });
    const saved = await saveApplicationEmployerWebsiteAction(
      null,
      form({
        campaignId: campaign.id,
        companyWebsite: "https://www.cscglobal.com/about",
      }),
    );
    expect(saved.ok).toBe(true);
    expect(saved.message).toBe(applicationWorkspaceCopy.companyWebsiteConflict);
    const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(after.website).toBe("https://kept.example");
    expect(after.normalizedDomain).toBe("kept.example");
    const requirement = await prisma.jobRequirement.findFirstOrThrow({
      where: { campaignId: campaign.id },
    });
    expect(requirement.suppliedEmployerWebsite).toBe("https://cscglobal.com");
  });

  it("shows the required prompt, does not research, and saves pasted notes", async () => {
    const company = await prisma.company.create({
      data: {
        organizationId,
        name: `No site ${suffix}`,
        normalizedName: `no-site-${suffix}`,
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Needs site ${suffix}`,
        productId,
      },
    });
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        companyId: company.id,
        rawText: "Engineer at a company with no website on file",
        companyName: company.name,
        employerDisposition: "IDENTIFIED",
        scorecardJson: { mission: null, outcomes: [], competencies: [] },
      },
    });
    const runs = await import("@/lib/research/runs-service");
    const jobs = await import("@/lib/application-jobs/service");
    const paid = await import("@/lib/ai/paid-call-gate");
    const enqueue = vi.spyOn(runs, "enqueueApplicationResearch");
    const enqueueJob = vi.spyOn(jobs, "enqueueApplicationJob");
    const paidCall = vi.spyOn(paid, "runPaidStructuredCall");
    const beforeRuns = await prisma.researchRun.count({ where: { campaignId: campaign.id } });
    const beforeJobs = await prisma.applicationJob.count({ where: { campaignId: campaign.id } });
    const element = await withTestTenant(organizationId, () =>
      ApplicationWorkspace({
        campaignId: campaign.id,
        organizationId,
        canEdit: true,
        focus: "company",
      }),
    );
    const html = renderToStaticMarkup(element);
    expect(html).toContain("data-testid=\"company-website-required\"");
    expect(html).toContain("Research does not run until you save");
    expect(html).toContain("data-testid=\"company-website\"");
    expect(html).toContain("data-testid=\"company-research-notes\"");
    expect(html).toContain(applicationWorkspaceCopy.companyNotesHelp);
    expect(html).toContain("name=\"notes\"");
    expect(enqueue).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();
    expect(await prisma.researchRun.count({ where: { campaignId: campaign.id } })).toBe(beforeRuns);
    expect(await prisma.applicationJob.count({ where: { campaignId: campaign.id } })).toBe(beforeJobs);

    const { setCompanyResearchProvider } = await import("@/lib/research/provider");
    let providerCalls = 0;
    setCompanyResearchProvider({
      async research() {
        providerCalls += 1;
        throw new Error("research should not run");
      },
    });
    const { researchCompany } = await import("@/lib/tenant/company-research-service");
    const skipped = await withTestTenant(organizationId, () => researchCompany(company.id));
    expect(skipped.skipped).toBe(true);
    expect(skipped.reason).toBe(applicationResearchCopy.websiteRequired);
    expect(providerCalls).toBe(0);
    setCompanyResearchProvider(null);

    const notes = "About page: CSC sells domain and digital-risk services.";
    const saved = await saveApplicationCompanyResearchNotesAction(
      null,
      form({ campaignId: campaign.id, notes }),
    );
    expect(saved.ok, saved.message).toBe(true);
    const stored = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(stored.companyResearchNotes).toBe(notes);
  });

  it("sends the anchor host in the research call and the paid-call fingerprint", async () => {
    const company = await prisma.company.create({
      data: {
        organizationId,
        name: `Anchored ${suffix}`,
        normalizedName: `anchored-${suffix}`,
        website: `https://other-${suffix}.example`,
        normalizedDomain: `other-${suffix}.example`,
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Anchor call ${suffix}`,
        productId,
        companyResearchNotes: "Paste: the About page describes digital brand protection.",
      },
    });
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        companyId: company.id,
        rawText: "Senior Director of Sales",
        companyName: company.name,
        suppliedEmployerWebsite: `https://anchor-${suffix}.example`,
        employerDisposition: "IDENTIFIED",
        scorecardJson: { mission: null, outcomes: [], competencies: [] },
      },
    });
    const previous = {
      model: process.env.RESEARCH_AI_MODEL,
      url: process.env.RESEARCH_AI_MODEL_URL,
      key: process.env.RESEARCH_AI_API_KEY,
    };
    process.env.RESEARCH_AI_PROVIDER = "openai-compatible";
    process.env.RESEARCH_AI_MODEL = "research-model";
    process.env.RESEARCH_AI_MODEL_URL = "https://research.example/v1/chat/completions";
    process.env.RESEARCH_AI_API_KEY = "research-key";
    const { setCompanyResearchProvider } = await import("@/lib/research/provider");
    let seen: Record<string, unknown> | null = null;
    setCompanyResearchProvider({
      async research(input) {
        seen = input as unknown as Record<string, unknown>;
        return {
          companySummary: "CSC provides domain and digital-risk services.",
          whatTheySell: "Digital brand protection",
          customerTypes: [],
          primaryMarkets: [],
          businessModel: null,
          estimatedAov: null,
          aovReasoning: null,
          companySizeContext: null,
          relevantTechnologies: [],
          buyingSignals: [],
          hiringSignals: [],
          riskSignals: [],
          confidence: "HIGH",
          sources: [
            {
              url: `https://anchor-${suffix}.example/about`,
              sourceType: "COMPANY_WEBSITE",
              retrievedAt: new Date().toISOString(),
              supports: ["companySummary"],
            },
          ],
        };
      },
    });
    try {
      const { researchCompany } = await import("@/lib/tenant/company-research-service");
      const result = await withTestTenant(organizationId, () =>
        researchCompany(company.id, {
          anchorWebsite: `https://www.anchor-${suffix}.example`,
          seekerSuppliedNotes: "Paste: the About page describes digital brand protection.",
          campaignId: campaign.id,
        }),
      );
      expect(result.skipped, result.reason).toBe(false);
      expect(seen).toMatchObject({
        name: company.name,
        website: `https://anchor-${suffix}.example`,
        normalizedDomain: `anchor-${suffix}.example`,
        seekerSuppliedNotes: "Paste: the About page describes digital brand protection.",
        campaignId: campaign.id,
        postingText: "Senior Director of Sales",
        postingTitle: null,
        postingUrl: null,
      });
      const stamped = await prisma.applicationEmployerResearch.findFirstOrThrow({
        where: { campaignId: campaign.id },
        orderBy: { updatedAt: "desc" },
      });
      expect(stamped.researchStageTimings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ anchorHost: `anchor-${suffix}.example` }),
        ]),
      );
      expect(
        await prisma.companyResearch.count({ where: { companyId: company.id } }),
      ).toBe(0);
      const { applicationResearchFingerprint, applicationResearchSubjectKey, COMPANY_RESEARCH_OPERATION } =
        await import("@/lib/research/company-research-paid-inputs");
      const fingerprint = applicationResearchFingerprint({
        anchorHost: `anchor-${suffix}.example`,
        website: `https://anchor-${suffix}.example`,
        postingTitle: null,
        postingUrl: null,
        postingText: "Senior Director of Sales",
        seekerSuppliedNotes: "Paste: the About page describes digital brand protection.",
      });
      const receipt = await prisma.paidCallReceipt.findFirst({
        where: {
          organizationId,
          operation: COMPANY_RESEARCH_OPERATION,
          subjectKey: applicationResearchSubjectKey(organizationId, campaign.id),
        },
      });
      expect(receipt?.inputHash).toBe(fingerprint);
    } finally {
      setCompanyResearchProvider(null);
      process.env.RESEARCH_AI_MODEL = previous.model;
      process.env.RESEARCH_AI_MODEL_URL = previous.url;
      process.env.RESEARCH_AI_API_KEY = previous.key;
    }
  });

  it("uses anchored research downstream and keeps unanchored rows gated", async () => {
    const { usableEmployerResearch } = await import(
      "@/lib/job-requirement/identity-verification"
    );
    const { loadCoachCompanyResearch } = await import(
      "@/lib/consultation/hiring-team-context"
    );
    const company = await prisma.company.create({
      data: {
        organizationId,
        name: `Gate ${suffix}`,
        normalizedName: `gate-${suffix}`,
        website: `https://gate-${suffix}.example`,
        normalizedDomain: `gate-${suffix}.example`,
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Gate ${suffix}`,
        productId,
      },
    });
    await prisma.companyResearch.create({
      data: {
        organizationId,
        companyId: company.id,
        status: "COMPLETED",
        companySummary: "CSC provides domain and digital-risk services.",
        whatTheySell: "Digital brand protection",
        identityAmbiguous: true,
        researchStageTimings: [{ anchorHost: `gate-${suffix}.example` }],
      },
    });
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        companyId: company.id,
        rawText: "Senior Director of Sales",
        companyName: company.name,
        suppliedEmployerWebsite: `https://gate-${suffix}.example`,
        employerDisposition: "IDENTIFIED",
        identityConfirmation: "PENDING",
        scorecardJson: { mission: null, outcomes: [], competencies: [] },
      },
    });
    const loaded = await prisma.jobRequirement.findFirstOrThrow({
      where: { campaignId: campaign.id },
      include: { company: { include: { research: { orderBy: { updatedAt: "desc" }, take: 1 } } } },
    });
    expect(
      usableEmployerResearch(loaded, loaded.company?.research[0] ?? null)?.companySummary,
    ).toBe("CSC provides domain and digital-risk services.");
    const coach = await loadCoachCompanyResearch(organizationId, campaign.id);
    expect(coach?.companySummary).toContain("domain and digital-risk");
    const runs = await import("@/lib/research/runs-service");
    const jobs = await import("@/lib/application-jobs/service");
    const paid = await import("@/lib/ai/paid-call-gate");
    const enqueue = vi.spyOn(runs, "enqueueApplicationResearch");
    const enqueueJob = vi.spyOn(jobs, "enqueueApplicationJob");
    const paidCall = vi.spyOn(paid, "runPaidStructuredCall");
    enqueue.mockClear();
    enqueueJob.mockClear();
    paidCall.mockClear();
    const html = renderToStaticMarkup(
      await ApplicationWorkspace({
        campaignId: campaign.id,
        organizationId,
        canEdit: true,
        focus: "company",
      }),
    );
    expect(html).not.toContain("data-testid=\"confirm-employer-identity\"");
    expect(html).not.toContain("data-testid=\"reject-employer-identity\"");
    expect(enqueue).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(paidCall).not.toHaveBeenCalled();

    const oldCompany = await prisma.company.create({
      data: {
        organizationId,
        name: "Acme Robotics",
        normalizedName: `acme-robotics-${suffix}`,
        website: "https://old.example",
        normalizedDomain: "old.example",
      },
    });
    const oldCampaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Old ${suffix}`,
        productId,
      },
    });
    await prisma.companyResearch.create({
      data: {
        organizationId,
        companyId: oldCompany.id,
        status: "COMPLETED",
        companySummary:
          "Acme Robotics is an FTC (FIRST Tech Challenge) student robotics team in Nevada City, CA. It is community-supported and not a commercial company.",
        whatTheySell: "Student robotics for grades 9-12 through FIRST Tech Challenge.",
        businessModel: "A high-school student team, not a commercial employer.",
        companySizeContext: "Seven students on a community-supported team.",
        identityAmbiguous: true,
      },
    });
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: oldCampaign.id,
        companyId: oldCompany.id,
        rawText: `Senior Product Engineer
Acme Robotics
Location: Austin, TX
Work arrangement: Hybrid
Employment type: Full-time
Seniority: Senior
Compensation: $160,000–$190,000
Reports to: Director of Engineering

Responsibilities:
- Build the motion-planning service

Requirements:
- 5 years of Python`,
        title: "Senior Product Engineer",
        companyName: "Acme Robotics",
        location: "Austin, TX",
        employmentType: "Full-time",
        seniority: "Senior",
        compensationRange: "$160,000–$190,000",
        suppliedEmployerWebsite: "https://old.example",
        employerDisposition: "IDENTIFIED",
        identityConfirmation: "PENDING",
        scorecardJson: { mission: null, outcomes: [], competencies: [] },
      },
    });
    const oldLoaded = await prisma.jobRequirement.findFirstOrThrow({
      where: { campaignId: oldCampaign.id },
      include: { company: { include: { research: { orderBy: { updatedAt: "desc" }, take: 1 } } } },
    });
    expect(usableEmployerResearch(oldLoaded, oldLoaded.company?.research[0] ?? null)).toBeNull();
    expect(await loadCoachCompanyResearch(organizationId, oldCampaign.id)).toBeNull();
    const oldHtml = renderToStaticMarkup(
      await withTestTenant(organizationId, () =>
        ApplicationWorkspace({
          campaignId: oldCampaign.id,
          organizationId,
          canEdit: true,
          focus: "company",
        }),
      ),
    );
    expect(oldHtml).toContain("data-testid=\"confirm-employer-identity\"");
    expect(oldHtml).toContain("data-testid=\"reject-employer-identity\"");
  });
});

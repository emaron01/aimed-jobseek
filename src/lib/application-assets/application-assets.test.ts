import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

const generateStructured = vi.hoisted(() => vi.fn());
const isAssetAiConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isAssetAiConfigured,
    getAssetAiProvider: () => ({ generateStructured }),
    getAssetValidationAiProvider: () => ({ generateStructured }),
  };
});

import {
  approveApplicationAsset,
  closingParagraphMakesClaim,
  coverLetterEvidenceIsThin,
  coverLetterThinEvidenceCopy,
  generateApplicationAsset,
} from "@/lib/application-assets/service";
import { COVER_LETTER_ASSET_PROMPT_VERSION } from "@/lib/application-assets/contract";
import {
  type ResumeAssetContent,
  type CoverLetterAssetContent,
} from "@/lib/application-assets/contract";
import { renderApplicationAssetDocx } from "@/lib/application-assets/docx";
import {
  formatResumeDateRange,
  formatResumeRoleMeta,
} from "@/lib/application-assets/dates";
import { loadApplicationGenerationContext } from "@/lib/generation/context";
import { loadEmailGenerationContext } from "@/lib/email-generation/context";
import { normalizeParsedJobRequirement } from "@/lib/job-requirement/normalize";
import {
  NORMAL_JOB_MODEL,
  NORMAL_JOB_POSTING,
} from "@/lib/job-requirement/fixtures";
import { applicationAssetConfig, vocab } from "@/lib/product-config";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";
import { confirmProfileContactDetails } from "@/lib/product-research/contact-details";
import { hasTestDatabase } from "@/test/database";

function support(sourceId: string, quote: string) {
  return [{ sourceId, quote }];
}

function validResume(): ResumeAssetContent {
  return {
    type: "RESUME",
    header: {
      name: {
        id: "header-name",
        text: "Alex Chen",
        supports: support("profile:id_name", "Alex Chen"),
      },
      contactDetails: [
        {
          id: "header-location",
          text: "Seattle, WA",
          supports: support("profile:id_city_state", "Seattle, WA"),
        },
      ],
    },
    summary: [
      {
        id: "summary-1",
        text: "Senior Software Engineer",
        supports: support("profile:id_headline", "Senior Software Engineer"),
      },
    ],
    experience: [
      {
        roleId: "role_1",
        employer: "Northwind Analytics",
        title: "Senior Software Engineer",
        startDate: "2021-01",
        endDate: null,
        location: "Seattle, WA",
        hidden: false,
        bullets: [
          {
            id: "bullet-1",
            text: "Led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
            supports: support(
              "profile:ach_1",
              "Led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
            ),
          },
        ],
      },
      {
        roleId: "role_2",
        employer: "Contoso Health",
        title: "Software Engineer",
        startDate: "2017-06",
        endDate: "2020-12",
        location: "Remote",
        hidden: false,
        bullets: [
          {
            id: "bullet-2",
            text: "Built the member-identity API used by the patient portal.",
            supports: support(
              "profile:ach_3",
              "Built the member-identity API used by the patient portal.",
            ),
          },
        ],
      },
    ],
    skills: [
      {
        id: "skill-1",
        text: "TypeScript",
        supports: support("profile:skill_1", "TypeScript"),
      },
    ],
    education: [
      {
        id: "education-1",
        text: "B.S. Computer Science, University of Washington, 2017",
        supports: support(
          "profile:edu_1",
          "B.S. Computer Science, University of Washington, 2017",
        ),
      },
    ],
    credentials: [],
  };
}

describe("application asset date display", () => {
  const { currentRoleLabel, rangeSeparator } = applicationAssetConfig.dateDisplay;

  it("formats completed, current, and year-only dates for the workspace view", () => {
    expect(formatResumeDateRange("2017-06", "2020-12")).toBe(
      `June 2017 ${rangeSeparator} December 2020`,
    );
    expect(formatResumeDateRange("2021-01", null)).toBe(
      `January 2021 ${rangeSeparator} ${currentRoleLabel}`,
    );
    expect(formatResumeDateRange("2015", "2016")).toBe(
      `2015 ${rangeSeparator} 2016`,
    );
    expect(formatResumeRoleMeta({
      startDate: "2021-01",
      endDate: null,
      location: "Seattle, WA",
    })).toBe(`January 2021 ${rangeSeparator} ${currentRoleLabel} | Seattle, WA`);
  });

  it("renders those dates in the DOCX without inventing a month", async () => {
    const resume = validResume();
    resume.experience.push({
      roleId: "role_year",
      employer: "Example Labs",
      title: "Intern",
      startDate: "2015",
      endDate: "2016",
      location: null,
      hidden: false,
      bullets: [],
    });
    const buffer = await renderApplicationAssetDocx(resume);
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")!.async("string");
    expect(documentXml).toContain(
      `January 2021 ${rangeSeparator} ${currentRoleLabel}`,
    );
    expect(documentXml).toContain(`June 2017 ${rangeSeparator} December 2020`);
    expect(documentXml).toContain(`2015 ${rangeSeparator} 2016`);
    expect(documentXml).not.toContain("January 2015");
    expect(documentXml).not.toContain("2021-01");
    expect(documentXml).not.toContain("2017-06");
  });
});

describe("application asset DOCX", () => {
  it("uses configured ATS-safe styles without tables, drawings, text boxes, headers, or footers", async () => {
    const buffer = await renderApplicationAssetDocx(validResume());
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")!.async("string");
    const stylesXml = await zip.file("word/styles.xml")!.async("string");
    const settingsXml = await zip.file("word/settings.xml")!.async("string");
    expect(documentXml).not.toMatch(/<w:tbl\b|<w:txbxContent\b|<w:drawing\b|<pic:pic\b/);
    expect(Object.keys(zip.files).some((name) => /word\/header\d+\.xml/.test(name))).toBe(false);
    expect(Object.keys(zip.files).some((name) => /word\/footer\d+\.xml/.test(name))).toBe(false);
    expect(stylesXml).toContain(applicationAssetConfig.docx.font);
    expect(documentXml).toContain(
      `w:top="${applicationAssetConfig.docx.marginTwips}"`,
    );
    expect(settingsXml).toBeTruthy();
  });
});

describe.skipIf(!hasTestDatabase())("application assets", () => {
  const suffix = Date.now().toString(36);
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let userId = "";
  let productId = "";
  let campaignId = "";
  let hiringManagerId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    prisma = new PrismaClient();
    const workspace = await createIndividualWorkspace({
      email: `assets-${suffix}@example.test`,
      name: "Asset Seeker",
    });
    organizationId = workspace.organization.id;
    userId = workspace.user.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Alex Profile ${suffix}`,
        profileJson: fixtureAlexChenProfile(),
        approvalStatus: "APPROVED",
      },
    });
    productId = product.id;
    const icp = await prisma.icp.create({
      data: { organizationId, productId, name: `Robotics ${suffix}` },
    });
    const company = await prisma.company.create({
      data: {
        organizationId,
        name: `Acme Robotics ${suffix}`,
        normalizedName: `acme robotics ${suffix}`,
        website: `https://acme-${suffix}.example`,
        normalizedDomain: `acme-${suffix}.example`,
      },
    });
    await prisma.companyResearch.create({
      data: {
        organizationId,
        companyId: company.id,
        status: "COMPLETED",
        companySummary: "Acme builds warehouse robotics systems.",
        researchSources: [
          {
            url: "https://example.com/acme-robotics",
            title: "Acme Robotics",
            publisher: "Acme",
            sourceType: "COMPANY_WEBSITE",
            retrievedAt: new Date().toISOString(),
            supports: ["Acme builds warehouse robotics systems."],
          },
        ],
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Robotics application ${suffix}`,
        productId,
        icpId: icp.id,
      },
    });
    campaignId = campaign.id;
    const parsed = normalizeParsedJobRequirement(
      NORMAL_JOB_MODEL,
      NORMAL_JOB_POSTING,
    );
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId,
        companyId: company.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        companyName: parsed.companyName,
        seniority: parsed.seniority,
        reportingLine: parsed.reportingLine,
        responsibilities: parsed.responsibilities,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        scorecardJson: parsed.scorecard,
      },
    });
    const hiringManager = await prisma.persona.create({
      data: {
        organizationId,
        productId,
        campaignId,
        suggestionKey: "hiring_manager",
        name: "Hiring Manager",
        targetTitles: ["Director of Engineering"],
      },
    });
    hiringManagerId = hiringManager.id;
    const contact = await prisma.contact.create({
      data: {
        organizationId,
        ownerUserId: userId,
        firstName: "Morgan",
        lastName: "Lee",
        company: "Acme Robotics",
      },
    });
    await prisma.campaignContact.create({
      data: {
        organizationId,
        campaignId,
        contactId: contact.id,
        chosenPersonaId: hiringManager.id,
      },
    });
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization
        .delete({ where: { id: organizationId } })
        .catch(() => undefined);
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    generateStructured.mockReset();
    isAssetAiConfigured.mockReturnValue(true);
    await prisma.applicationAsset.deleteMany({ where: { campaignId } });
  });

  function validCoverLetter(
    payload: {
      salutation: string;
      signerName: string;
      sources: Array<{ id: string; text: string; url: string | null }>;
    },
  ): CoverLetterAssetContent {
    const research = payload.sources.find(
      (source) => source.url === "https://example.com/acme-robotics",
    )!;
    return {
      type: "COVER_LETTER",
      salutation: payload.salutation,
      paragraphs: [
        {
          id: "cover-opening",
          text: "Acme builds warehouse robotics systems, and my Northwind Analytics billing work is the closest match I have to keeping a high-volume system dependable.",
          supports: [
            ...support(research.id, "Acme builds warehouse robotics systems."),
            ...support(
              "profile:role_1",
              "Senior Software Engineer. Northwind Analytics. 2021-01. Seattle, WA. Billing and payments systems.",
            ),
          ],
        },
        {
          id: "cover-story",
          text: "At Northwind Analytics I led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
          supports: [
            ...support(
              "profile:role_1",
              "Senior Software Engineer. Northwind Analytics. 2021-01. Seattle, WA. Billing and payments systems.",
            ),
            ...support(
              "profile:ach_1",
              "Led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
            ),
          ],
        },
        {
          id: "cover-close",
          text: "Can we schedule a conversation about the role?",
          supports: support("profile:id_name", "Alex Chen"),
        },
      ],
      signoff: "Sincerely,",
      signerName: payload.signerName,
    };
  }

  function installModel(input?: {
    resumes?: ResumeAssetContent[];
    coverLetters?: CoverLetterAssetContent[];
    coverLetter?: CoverLetterAssetContent;
    violations?: Array<{ claimId: string; reason: string }>;
  }) {
    const resumes = [...(input?.resumes ?? [validResume()])];
    const coverLetters = [...(input?.coverLetters ?? [])];
    generateStructured.mockImplementation(
      async (request: { schemaName: string; messages: Array<{ content: string }> }) => {
        if (request.schemaName === "application_resume") {
          return { data: resumes.shift() ?? validResume() };
        }
        if (request.schemaName === "application_cover_letter") {
          const payload = JSON.parse(request.messages.at(-1)?.content ?? "{}") as {
            salutation: string;
            signerName: string;
            sources: Array<{ id: string; text: string; url: string | null }>;
          };
          return {
            data:
              coverLetters.shift() ??
              input?.coverLetter ??
              validCoverLetter(payload),
          };
        }
        if (request.schemaName === "application_asset_claim_validation") {
          return { data: { violations: input?.violations ?? [] } };
        }
        throw new Error(`Unexpected schema ${request.schemaName}`);
      },
    );
  }

  it("fails closed and never saves a resume with an unknown claim source", async () => {
    const invalid = validResume();
    invalid.summary = [
      {
        id: "fabricated",
        text: "Managed 50 engineers.",
        supports: support("profile:not-real", "Managed 50 engineers."),
      },
    ];
    installModel({ resumes: [invalid, invalid, invalid, invalid, invalid] });
    const result = await generateApplicationAsset({
      organizationId,
      campaignId,
      userId,
      type: "RESUME",
    });
    expect(result.ok).toBe(false);
    expect(
      await prisma.applicationAsset.count({ where: { campaignId } }),
    ).toBe(0);
  });

  it("regenerates banned language and preserves exact roles and seeker hide choices", async () => {
    const banned = validResume();
    banned.summary[0] = {
      ...banned.summary[0]!,
      text: "Spearheaded TypeScript work.",
      supports: support("profile:skill_1", "TypeScript"),
    };
    const hidden = validResume();
    hidden.experience[1]!.hidden = true;
    installModel({ resumes: [banned, hidden] });
    const result = await generateApplicationAsset({
      organizationId,
      campaignId,
      userId,
      type: "RESUME",
      hiddenRoleIds: ["role_2"],
    });
    expect(result.ok).toBe(true);
    const saved = await prisma.applicationAsset.findFirst({
      where: { campaignId, type: "RESUME" },
    });
    expect(saved?.contentJson).toMatchObject({
      experience: [
        {
          employer: "Northwind Analytics",
          title: "Senior Software Engineer",
          startDate: "2021-01",
          hidden: false,
        },
        {
          employer: "Contoso Health",
          title: "Software Engineer",
          startDate: "2017-06",
          endDate: "2020-12",
          hidden: true,
        },
      ],
    });
    expect(saved?.claimTraceJson).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimId: "role:role_1:employer",
          text: "Northwind Analytics",
        }),
        expect.objectContaining({
          claimId: "role:role_2:startDate",
          text: "2017-06",
        }),
      ]),
    );
    expect(
      generateStructured.mock.calls.filter(
        ([request]) => request.schemaName === "application_resume",
      ),
    ).toHaveLength(2);
  });

  it("does not save a resume claim that traces only to the job posting", async () => {
    const invalid = validResume();
    invalid.skills = [
      {
        id: "skill-job",
        text: "Python",
        supports: support("job:posting", "Python"),
      },
    ];
    installModel({ resumes: [invalid, invalid, invalid, invalid, invalid] });
    const result = await generateApplicationAsset({
      organizationId,
      campaignId,
      userId,
      type: "RESUME",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected fail-closed generation.");
    expect(result.violations.some((item) => item.includes("skill-job"))).toBe(
      true,
    );
    expect(
      await prisma.applicationAsset.count({ where: { campaignId } }),
    ).toBe(0);
  });

  it("uses the Hiring Manager roster name and cited research in the cover-letter opening", async () => {
    installModel();
    const result = await generateApplicationAsset({
      organizationId,
      campaignId,
      userId,
      type: "COVER_LETTER",
    });
    expect(result.ok).toBe(true);
    const saved = await prisma.applicationAsset.findFirst({
      where: { campaignId, type: "COVER_LETTER" },
    });
    expect(saved?.personaId).toBe(hiringManagerId);
    const content =
      saved?.contentJson as unknown as CoverLetterAssetContent | undefined;
    expect(content?.salutation).toBe("Dear Morgan Lee,");
    expect(
      content?.paragraphs[0]?.supports.some((item) =>
        /^research:.+:source:0$/.test(item.sourceId),
      ),
    ).toBe(true);
    expect(
      content?.paragraphs[0]?.supports.some((item) =>
        item.sourceId.startsWith("profile:"),
      ),
    ).toBe(true);
  });

  it("regenerates a cover letter that restates a phrase without adding information", async () => {
    installModel({
      coverLetters: [
        {
          type: "COVER_LETTER",
          salutation: "Dear Morgan Lee,",
          paragraphs: [
            {
              id: "cover-opening",
              text: "Acme builds warehouse robotics systems, and my Northwind Analytics billing work is the closest match I have to keeping a high-volume system dependable.",
              supports: [
                ...support(
                  "research:placeholder:source:0",
                  "Acme builds warehouse robotics systems.",
                ),
                ...support(
                  "profile:role_1",
                  "Senior Software Engineer. Northwind Analytics. 2021-01. Seattle, WA. Billing and payments systems.",
                ),
              ],
            },
            {
              id: "cover-story",
              text: "I led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters. I led the rewrite of invoice generation that cut those failed billing runs from 8% to under 1% over two quarters.",
              supports: support(
                "profile:ach_1",
                "Led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
              ),
            },
            {
              id: "cover-close",
              text: "Can we schedule a conversation about the role?",
              supports: support("profile:id_name", "Alex Chen"),
            },
          ],
          signoff: "Sincerely,",
          signerName: "Alex Chen",
        },
      ],
    });
    const result = await generateApplicationAsset({
      organizationId,
      campaignId,
      userId,
      type: "COVER_LETTER",
    });
    expect(result.ok).toBe(true);
    expect(
      generateStructured.mock.calls.filter(
        ([request]) => request.schemaName === "application_cover_letter",
      ),
    ).toHaveLength(2);
  });

  it("regenerates when a configured cover-letter banned phrase appears", async () => {
    for (const phrase of applicationAssetConfig.bannedPhrases) {
      generateStructured.mockReset();
      await prisma.applicationAsset.deleteMany({ where: { campaignId } });
      const banned: CoverLetterAssetContent = {
        type: "COVER_LETTER",
        salutation: "Dear Morgan Lee,",
        paragraphs: [
          {
            id: "cover-opening",
            text: `${phrase} for a team that builds warehouse robotics systems, and my Northwind Analytics billing work is the closest match I have to keeping a high-volume system dependable.`,
            supports: [
              ...support(
                "research:placeholder:source:0",
                "Acme builds warehouse robotics systems.",
              ),
              ...support(
                "profile:role_1",
                "Senior Software Engineer. Northwind Analytics. 2021-01. Seattle, WA. Billing and payments systems.",
              ),
            ],
          },
          {
            id: "cover-story",
            text: "At Northwind Analytics I led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
            supports: support(
              "profile:ach_1",
              "Led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
            ),
          },
          {
            id: "cover-close",
            text: "Can we schedule a conversation about the role?",
            supports: support("profile:id_name", "Alex Chen"),
          },
        ],
        signoff: "Sincerely,",
        signerName: "Alex Chen",
      };
      installModel({ coverLetters: [banned] });
      const result = await generateApplicationAsset({
        organizationId,
        campaignId,
        userId,
        type: "COVER_LETTER",
      });
      expect(result.ok).toBe(true);
      expect(
        generateStructured.mock.calls.filter(
          ([request]) => request.schemaName === "application_cover_letter",
        ),
      ).toHaveLength(2);
    }
  });

  it("allows a no-claim closing without a citation and rejects a claim without one", async () => {
    expect(closingParagraphMakesClaim("Can we schedule a conversation about the role?")).toBe(
      false,
    );
    expect(closingParagraphMakesClaim("Thank you for your time.")).toBe(false);
    expect(
      closingParagraphMakesClaim(
        "I led the rewrite that cut failed billing runs from 8% and would welcome a conversation.",
      ),
    ).toBe(true);

    const noClaim = (payload: {
      salutation: string;
      signerName: string;
      sources: Array<{ id: string; text: string; url: string | null }>;
    }): CoverLetterAssetContent => {
      const letter = validCoverLetter(payload);
      letter.paragraphs[2] = {
        id: "cover-close",
        text: "Can we schedule a conversation about the role?",
        supports: [],
      };
      return letter;
    };
    installModel({
      coverLetters: [],
      coverLetter: undefined,
    });
    generateStructured.mockImplementation(
      async (request: { schemaName: string; messages: Array<{ content: string }> }) => {
        if (request.schemaName === "application_cover_letter") {
          const payload = JSON.parse(request.messages.at(-1)?.content ?? "{}") as {
            salutation: string;
            signerName: string;
            sources: Array<{ id: string; text: string; url: string | null }>;
          };
          return { data: noClaim(payload) };
        }
        if (request.schemaName === "application_asset_claim_validation") {
          return { data: { violations: [] } };
        }
        return { data: validResume() };
      },
    );
    const allowed = await generateApplicationAsset({
      organizationId,
      campaignId,
      userId,
      type: "COVER_LETTER",
    });
    expect(allowed.ok).toBe(true);

    await prisma.applicationAsset.deleteMany({ where: { campaignId, type: "COVER_LETTER" } });
    generateStructured.mockImplementation(
      async (request: { schemaName: string; messages: Array<{ content: string }> }) => {
        if (request.schemaName === "application_cover_letter") {
          const payload = JSON.parse(request.messages.at(-1)?.content ?? "{}") as {
            salutation: string;
            signerName: string;
            sources: Array<{ id: string; text: string; url: string | null }>;
          };
          const letter = validCoverLetter(payload);
          letter.paragraphs[2] = {
            id: "cover-close",
            text: "I led the rewrite that cut failed billing runs from 8% and would welcome a conversation.",
            supports: [],
          };
          return { data: letter };
        }
        if (request.schemaName === "application_asset_claim_validation") {
          return { data: { violations: [] } };
        }
        return { data: validResume() };
      },
    );
    const claimed = await generateApplicationAsset({
      organizationId,
      campaignId,
      userId,
      type: "COVER_LETTER",
    });
    expect(claimed.ok).toBe(false);
    if (claimed.ok) throw new Error("Expected a claimed closing to fail.");
    expect(claimed.violations.some((item) => item.includes("closing"))).toBe(true);
  });

  it("rejects an opening that does not cite both research and a Personal Profile fact", async () => {
    const opening = {
      type: "COVER_LETTER" as const,
      salutation: "Dear Morgan Lee,",
      paragraphs: [
        {
          id: "cover-opening",
          text: "Acme builds warehouse robotics systems.",
          supports: support(
            "research:placeholder:source:0",
            "Acme builds warehouse robotics systems.",
          ),
        },
        {
          id: "cover-story",
          text: "At Northwind Analytics I led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
          supports: support(
            "profile:ach_1",
            "Led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
          ),
        },
        {
          id: "cover-close",
          text: "Can we schedule a conversation about the role?",
          supports: support("profile:id_name", "Alex Chen"),
        },
      ],
      signoff: "Sincerely,",
      signerName: "Alex Chen",
    };
    installModel({
      coverLetters: [opening, opening, opening, opening, opening],
    });
    const result = await generateApplicationAsset({
      organizationId,
      campaignId,
      userId,
      type: "COVER_LETTER",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected the opening to fail closed.");
    expect(
      result.violations.some((item) =>
        item.includes("Personal Profile FACT"),
      ),
    ).toBe(true);
    expect(
      await prisma.applicationAsset.count({
        where: { campaignId, type: "COVER_LETTER" },
      }),
    ).toBe(0);
  });

  it("generates a cover letter from the posting when employer research is rejected", async () => {
    await prisma.jobRequirement.update({
      where: { campaignId },
      data: { identityConfirmation: "REJECTED" },
    });
    generateStructured.mockImplementation(
      async (request: { schemaName: string; messages: Array<{ content: string }> }) => {
        if (request.schemaName === "application_cover_letter") {
          const payload = JSON.parse(request.messages.at(-1)?.content ?? "{}") as {
            salutation: string;
            signerName: string;
            sources: Array<{ id: string; text: string; url: string | null }>;
          };
          expect(
            payload.sources.some((source) => source.id.startsWith("research:")),
          ).toBe(false);
          const job = payload.sources.find((source) => source.id === "job:posting");
          if (!job) throw new Error("Expected the job posting source.");
          return {
            data: {
              type: "COVER_LETTER",
              salutation: payload.salutation,
              paragraphs: [
                {
                  id: "cover-opening",
                  text: "The Senior Product Engineer role is about warehouse robotics, and my Northwind Analytics billing work is the closest match I have to keeping a high-volume system dependable.",
                  supports: [
                    ...support(job.id, "Senior Product Engineer"),
                    ...support(
                      "profile:role_1",
                      "Senior Software Engineer. Northwind Analytics. 2021-01. Seattle, WA. Billing and payments systems.",
                    ),
                  ],
                },
                {
                  id: "cover-story",
                  text: "At Northwind Analytics I led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
                  supports: support(
                    "profile:ach_1",
                    "Led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
                  ),
                },
                {
                  id: "cover-close",
                  text: "Can we schedule a conversation about the role?",
                  supports: [],
                },
              ],
              signoff: "Sincerely,",
              signerName: payload.signerName,
            },
          };
        }
        if (request.schemaName === "application_asset_claim_validation") {
          return { data: { violations: [] } };
        }
        return { data: validResume() };
      },
    );
    const result = await generateApplicationAsset({
      organizationId,
      campaignId,
      userId,
      type: "COVER_LETTER",
    });
    expect(result.ok).toBe(true);
    await prisma.jobRequirement.update({
      where: { campaignId },
      data: { identityConfirmation: "PENDING" },
    });
  });

  it("rejects and regenerates a cover letter that pairs an acknowledged gap with unrelated experience", async () => {
    expect(COVER_LETTER_ASSET_PROMPT_VERSION).toBe("11");
    const session =
      (await prisma.consultationSession.findUnique({ where: { campaignId } })) ??
      (await prisma.consultationSession.create({
        data: {
          organizationId,
          campaignId,
          productId,
          promptVersion: "3",
          status: "DONE",
        },
      }));
    await prisma.consultationAssessment.upsert({
      where: {
        sessionId_targetKey: { sessionId: session.id, targetKey: "preferred:0" },
      },
      create: {
        organizationId,
        sessionId: session.id,
        targetKey: "preferred:0",
        kind: "PREFERRED",
        text: "ROS2 experience is a gap.",
        strength: "NONE",
        supportingFactIds: [],
        strategy: "ACKNOWLEDGE",
        explanation: "The posting prefers ROS2 and the profile does not include it.",
        strategyText: "I would ramp on ROS2 in the first weeks.",
      },
      update: {
        text: "ROS2 experience is a gap.",
        strength: "NONE",
        strategy: "ACKNOWLEDGE",
        explanation: "The posting prefers ROS2 and the profile does not include it.",
        strategyText: "I would ramp on ROS2 in the first weeks.",
      },
    });

    const mixed = (
      payload: {
        salutation: string;
        signerName: string;
        sources: Array<{ id: string; text: string; url: string | null }>;
      },
    ): CoverLetterAssetContent => {
      const letter = validCoverLetter(payload);
      letter.paragraphs = [
        letter.paragraphs[0]!,
        {
          id: "cover-gap-mixed",
          text: "ROS2 experience is a gap, and at Contoso Health I built the member-identity API used by the patient portal.",
          supports: [
            ...support("assessment:preferred:0", "ROS2 experience is a gap"),
            ...support(
              "profile:ach_3",
              "Built the member-identity API used by the patient portal.",
            ),
          ],
        },
        letter.paragraphs[2]!,
      ];
      return letter;
    };
    const coherent = (
      payload: {
        salutation: string;
        signerName: string;
        sources: Array<{ id: string; text: string; url: string | null }>;
      },
    ): CoverLetterAssetContent => {
      const letter = validCoverLetter(payload);
      letter.paragraphs = [
        letter.paragraphs[0]!,
        letter.paragraphs[1]!,
        {
          id: "cover-gap",
          text: "ROS2 experience is a gap, and I would ramp on it in the first weeks.",
          supports: support("assessment:preferred:0", "ROS2 experience is a gap"),
        },
        letter.paragraphs[2]!,
      ];
      return letter;
    };

    let coverLetterCalls = 0;
    generateStructured.mockImplementation(
      async (request: { schemaName: string; messages: Array<{ content: string }> }) => {
        if (request.schemaName === "application_cover_letter") {
          const payload = JSON.parse(request.messages.at(-1)?.content ?? "{}") as {
            salutation: string;
            signerName: string;
            sources: Array<{ id: string; text: string; url: string | null }>;
          };
          coverLetterCalls += 1;
          return {
            data: coverLetterCalls === 1 ? mixed(payload) : coherent(payload),
          };
        }
        if (request.schemaName === "application_asset_claim_validation") {
          return { data: { violations: [] } };
        }
        return { data: validResume() };
      },
    );

    const result = await generateApplicationAsset({
      organizationId,
      campaignId,
      userId,
      type: "COVER_LETTER",
    });
    expect(result.ok).toBe(true);
    expect(coverLetterCalls).toBe(2);
    const saved = await prisma.applicationAsset.findFirst({
      where: { campaignId, type: "COVER_LETTER" },
    });
    const content = saved?.contentJson as unknown as CoverLetterAssetContent | undefined;
    expect(content?.paragraphs).toBeTruthy();
    for (const paragraph of content?.paragraphs ?? []) {
      const sourceIds = paragraph.supports.map((item) => item.sourceId);
      const citesGap = sourceIds.includes("assessment:preferred:0");
      const citesContoso =
        sourceIds.includes("profile:ach_3") || sourceIds.includes("profile:role_2");
      expect(citesGap && citesContoso).toBe(false);
      expect(paragraph.text).not.toMatch(/ROS2[\s\S]*member-identity API/i);
    }
  });

  it("rejects a cover letter that omits approved outcome statements or drops the result", async () => {
    expect(COVER_LETTER_ASSET_PROMPT_VERSION).toBe("11");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const session =
      (await prisma.consultationSession.findUnique({ where: { campaignId } })) ??
      (await prisma.consultationSession.create({
        data: {
          organizationId,
          campaignId,
          productId,
          promptVersion: "3",
          status: "DONE",
        },
      }));
    const turn =
      (await prisma.consultationTurn.findFirst({
        where: { sessionId: session.id, targetKey: "required:1" },
      })) ??
      (await prisma.consultationTurn.create({
        data: {
          organizationId,
          sessionId: session.id,
          sequence: 20,
          speaker: "SEEKER",
          body: "I led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
          seekerAuthored: true,
          targetKey: "required:1",
        },
      }));
    await prisma.consultationStatement.upsert({
      where: { turnId_kind: { turnId: turn.id, kind: "INTERVIEW_ANSWER" } },
      create: {
        organizationId,
        sessionId: session.id,
        turnId: turn.id,
        kind: "INTERVIEW_ANSWER",
        status: "APPROVED",
        content:
          "I led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
        approvedAt: new Date(),
        promptVersion: "3",
        groundingJson: {},
      },
      update: {
        status: "APPROVED",
        content:
          "I led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
        approvedAt: new Date(),
      },
    });

    const thinBody = (
      payload: {
        salutation: string;
        signerName: string;
        sources: Array<{ id: string; text: string; url: string | null }>;
      },
    ): CoverLetterAssetContent => {
      const letter = validCoverLetter(payload);
      letter.paragraphs[1] = {
        id: "cover-story",
        text: "At Northwind Analytics I led the invoice-generation rewrite and owned on-call.",
        supports: support(
          "profile:role_1",
          "Senior Software Engineer. Northwind Analytics. 2021-01. Seattle, WA. Billing and payments systems.",
        ),
      };
      return letter;
    };
    const withStatement = (
      payload: {
        salutation: string;
        signerName: string;
        sources: Array<{ id: string; text: string; url: string | null }>;
      },
    ): CoverLetterAssetContent => {
      const letter = validCoverLetter(payload);
      const statement = payload.sources.find((source) =>
        source.id.startsWith("statement:"),
      );
      if (!statement) throw new Error("Expected an approved statement source.");
      letter.paragraphs[1] = {
        id: "cover-story",
        text: "I led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
        supports: support(
          statement.id,
          "I led the rewrite of invoice generation that cut failed billing runs from 8% to under 1% over two quarters.",
        ),
      };
      return letter;
    };

    let coverLetterCalls = 0;
    generateStructured.mockImplementation(
      async (request: { schemaName: string; messages: Array<{ content: string }> }) => {
        if (request.schemaName === "application_cover_letter") {
          const payload = JSON.parse(request.messages.at(-1)?.content ?? "{}") as {
            salutation: string;
            signerName: string;
            sources: Array<{ id: string; text: string; url: string | null }>;
          };
          coverLetterCalls += 1;
          return {
            data: coverLetterCalls === 1 ? thinBody(payload) : withStatement(payload),
          };
        }
        if (request.schemaName === "application_asset_claim_validation") {
          return { data: { violations: [] } };
        }
        return { data: validResume() };
      },
    );

    const result = await generateApplicationAsset({
      organizationId,
      campaignId,
      userId,
      type: "COVER_LETTER",
    });
    expect(result.ok).toBe(true);
    expect(coverLetterCalls).toBe(2);
    const logs = info.mock.calls
      .map(([value]) => {
        if (typeof value !== "string") return null;
        try {
          return JSON.parse(value) as {
            event?: string;
            passed?: boolean;
            reasons?: string[];
          };
        } catch {
          return null;
        }
      })
      .filter((event) => event?.event === "cover_letter_validation");
    expect(logs[0]?.passed).toBe(false);
    expect(logs[0]?.reasons?.join(" ")).toMatch(
      /approved consultation statements|personally did/,
    );
    expect(logs.at(-1)?.passed).toBe(true);
    const saved = await prisma.applicationAsset.findFirst({
      where: { campaignId, type: "COVER_LETTER" },
      orderBy: { version: "desc" },
    });
    const content = saved?.contentJson as unknown as CoverLetterAssetContent | undefined;
    expect(
      content?.paragraphs.some((paragraph) =>
        paragraph.supports.some((item) => item.sourceId.startsWith("statement:")),
      ),
    ).toBe(true);
    expect(
      content?.paragraphs.some((paragraph) =>
        /cut failed billing runs from 8% to under 1%/.test(paragraph.text),
      ),
    ).toBe(true);
    info.mockRestore();
  });

  it("increments versions and keeps only one approved version per type", async () => {
    installModel({ resumes: [validResume(), validResume()] });
    const first = await generateApplicationAsset({
      organizationId,
      campaignId,
      userId,
      type: "RESUME",
    });
    const second = await generateApplicationAsset({
      organizationId,
      campaignId,
      userId,
      type: "RESUME",
    });
    expect(first.ok && first.version).toBe(1);
    expect(second.ok && second.version).toBe(2);
    if (!first.ok || !second.ok) throw new Error("Generation failed.");
    await approveApplicationAsset({
      organizationId,
      campaignId,
      userId,
      assetId: first.assetId,
    });
    await approveApplicationAsset({
      organizationId,
      campaignId,
      userId,
      assetId: second.assetId,
    });
    const rows = await prisma.applicationAsset.findMany({
      where: { campaignId, type: "RESUME" },
      orderBy: { version: "asc" },
    });
    expect(rows.map((row) => [row.version, row.status])).toEqual([
      [1, "DRAFT"],
      [2, "APPROVED"],
    ]);
  });

  it("loads contact-free generation context without a roster contact", async () => {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { icpId: true },
    });
    const emptyCampaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        productId,
        icpId: campaign!.icpId,
        name: `No contact ${suffix}`,
      },
    });
    const parsed = normalizeParsedJobRequirement(
      NORMAL_JOB_MODEL,
      NORMAL_JOB_POSTING,
    );
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: emptyCampaign.id,
        rawText: NORMAL_JOB_POSTING,
        scorecardJson: parsed.scorecard,
      },
    });
    const context = await loadApplicationGenerationContext(
      emptyCampaign.id,
      userId,
    );
    expect(context.campaign.id).toBe(emptyCampaign.id);
    expect(context.profile?.identity.name?.text).toBe("Alex Chen");
    expect(context.hiringManagerContactName).toBeNull();
  });

  it("still loads email generation context with the roster contact", async () => {
    const campaignContact = await prisma.campaignContact.findFirst({
      where: { campaignId },
      select: { id: true },
    });
    const context = await loadEmailGenerationContext(
      campaignContact!.id,
      userId,
    );
    expect(context.contact.firstName).toBe("Morgan");
    expect(context.contact.lastName).toBe("Lee");
    expect(context.campaign.id).toBe(campaignId);
    expect(context.product.name).toContain("Alex Profile");
    expect(context.persona.name).toBe("Hiring Manager");
  });

  it("records seeker-confirmed contact details as traceable FACT items", async () => {
    const profile = fixtureAlexChenProfile();
    profile.identity.email = {
      id: "id_email",
      kind: "INFERENCE",
      text: "alex@example.test",
      provenance: [],
    };
    const confirmed = await confirmProfileContactDetails({
      organizationId,
      productId,
      userId,
      profile,
    });
    expect(confirmed.identity.email?.kind).toBe("FACT");
    const sourceId = confirmed.identity.email?.provenance.at(-1)?.sourceId;
    expect(sourceId).toBeTruthy();
    expect(
      await prisma.productSource.findFirst({
        where: { id: sourceId, productId, organizationId },
      }),
    ).toMatchObject({
      sourceType: "USER_NOTE",
      acquisitionMethod: "USER_CONFIRMED",
      status: "EXTRACTED",
    });
  });
});

describe("application asset seeker-facing labels", () => {
  it("hides claim ids, source ids, and asset enums from the workspace", async () => {
    const { readFileSync } = await import("node:fs");
    const {
      formatAssetSourceKind,
      formatAssetStatusLabel,
      formatClaimEditorLabel,
      formatClaimSupportLabel,
    } = await import("@/lib/application-assets/display");
    const { vocab, consultationConfig } = await import("@/lib/product-config");

    expect(formatAssetStatusLabel("DRAFT")).toBe("Draft");
    expect(formatAssetStatusLabel("APPROVED")).toBe("Approved");
    expect(formatAssetSourceKind("profile:identity_name")).toBe(
      vocab.product.singular,
    );
    expect(formatAssetSourceKind("statement:abc")).toBe(
      consultationConfig.displayName,
    );
    expect(formatClaimSupportLabel("profile:identity_name", "Alex Chen")).toBe(
      `${vocab.product.singular}: “Alex Chen”`,
    );
    expect(formatClaimEditorLabel("  Led the invoice rewrite  ")).toBe(
      "Led the invoice rewrite",
    );
    expect(formatClaimSupportLabel("profile:identity_name", "Alex Chen")).not.toMatch(
      /profile:identity_name/,
    );

    const action = readFileSync("src/app/actions/application-assets.ts", "utf8");
    const generateFn = action.slice(
      action.indexOf("export async function generateApplicationAssetAction"),
      action.indexOf("export async function approveApplicationAssetAction"),
    );
    expect(generateFn.indexOf("if (!result.ok)")).toBeGreaterThan(-1);
    expect(generateFn.indexOf("if (!result.ok)")).toBeLessThan(
      generateFn.indexOf("revalidate(id)"),
    );

    const section = readFileSync(
      "src/components/ApplicationAssetsSection.tsx",
      "utf8",
    );
    expect(section).toContain("formatClaimSupportLabel");
    expect(section).toContain("formatAssetStatusLabel");
    expect(section).toContain("formatClaimEditorLabel");
    expect(section).not.toContain("${item.sourceId}");
    expect(section).not.toContain("{claim.id}</span>");
    expect(section).not.toContain("{asset.status}");
    expect(section).toContain("coverLetterThinNotice");
    expect(section).toContain("cover-letter-thin-evidence");
  });
});

describe("cover letter substance", () => {
  it("treats a short letter as correct when the seeker has no consulted story", () => {
    expect(
      coverLetterEvidenceIsThin({
        approvedStatementCount: 0,
        approvedStoryCount: 0,
        achievementTexts: ["Helped the team with reports"],
      }),
    ).toBe(true);
    expect(
      coverLetterEvidenceIsThin({
        approvedStatementCount: 0,
        approvedStoryCount: 0,
        achievementTexts: [
          "Led the rewrite of invoice generation that cut failed billing runs from 8% to under 1%.",
        ],
      }),
    ).toBe(false);
    expect(coverLetterThinEvidenceCopy()).toContain(vocab.product.singular);
    expect(coverLetterThinEvidenceCopy()).toContain("Harper");
  });
});

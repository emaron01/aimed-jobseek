import { beforeAll, describe, expect, it } from "vitest";
import { seedContactOnList } from "@/test/contact-seed";
import { withTestTenant } from "@/test/with-test-tenant";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)("company research (Phase 3B)", {
  timeout: 60_000,
}, () => {
  let prisma: import("@prisma/client").PrismaClient;
  let ready = false;
  let orgAId = "";
  let orgBId = "";
  let ownerAId = "";
  let ownerBId = "";
  let suffix = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();

    try {
      await prisma.$queryRaw`SELECT "normalizedDomain" FROM "Company" LIMIT 0`;
      await prisma.$queryRaw`SELECT "researchMethod" FROM "CompanyResearch" LIMIT 0`;
      await prisma.$queryRaw`SELECT "aiProvider", "promptVersion" FROM "CompanyResearch" LIMIT 0`;
      await prisma.$queryRaw`SELECT "companyId" FROM "Contact" LIMIT 0`;
    } catch {
      console.warn(
        "Skipping company research DB tests: apply company research migrations first.",
      );
      return;
    }

    ready = true;
    suffix = Date.now().toString(36);

    const orgA = await prisma.organization.create({
      data: {
        name: `[TEST] Research Org A ${suffix}`,
        slug: `test-research-a-${suffix}`,
        status: "ACTIVE",
      },
    });
    const orgB = await prisma.organization.create({
      data: {
        name: `[TEST] Research Org B ${suffix}`,
        slug: `test-research-b-${suffix}`,
        status: "ACTIVE",
      },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;
    const ownerA = await prisma.user.create({
      data: {
        email: `research-owner-a-${suffix}@example.test`,
        emailNormalized: `research-owner-a-${suffix}@example.test`,
      },
    });
    const ownerB = await prisma.user.create({
      data: {
        email: `research-owner-b-${suffix}@example.test`,
        emailNormalized: `research-owner-b-${suffix}@example.test`,
      },
    });
    ownerAId = ownerA.id;
    ownerBId = ownerB.id;
    await prisma.organizationMembership.createMany({
      data: [
        { organizationId: orgAId, userId: ownerAId, role: "OWNER" },
        { organizationId: orgBId, userId: ownerBId, role: "OWNER" },
      ],
    });
  });

  it("same tenant + same normalized domain reuses one Company", async () => {
    if (!ready) return;

    const { resolveOrCreateCompany } = await import("@/lib/tenant/companies");

    await withTestTenant(orgAId, async () => {
      const first = await resolveOrCreateCompany({
        name: "Acme Corp",
        website: "https://www.acme-reuse.com/",
      });
      const second = await resolveOrCreateCompany({
        name: "Acme Corporation",
        website: "www.acme-reuse.com",
      });

      expect(first?.id).toBeTruthy();
      expect(second?.id).toBe(first?.id);
    });
  });

  it("same domain across different Organizations does not share Company", async () => {
    if (!ready) return;

    const { resolveOrCreateCompany } = await import("@/lib/tenant/companies");
    const companyA = await withTestTenant(orgAId, () =>
      resolveOrCreateCompany({
        name: "Shared Domain Co",
        website: "https://shared-domain-test.com",
      }),
    );

    const companyB = await withTestTenant(orgBId, () =>
      resolveOrCreateCompany({
        name: "Shared Domain Co",
        website: "https://shared-domain-test.com",
      }),
    );

    expect(companyA?.id).toBeTruthy();
    expect(companyB?.id).toBeTruthy();
    expect(companyA?.id).not.toBe(companyB?.id);
    expect(companyA?.organizationId).toBe(orgAId);
    expect(companyB?.organizationId).toBe(orgBId);
  });

  it("CompanyResearch cannot be accessed cross-tenant", async () => {
    if (!ready) return;

    const { resolveOrCreateCompany, saveCompanyResearch, getLatestCompanyResearch } =
      await import("@/lib/tenant/companies");
    const { TenantError } = await import("@/lib/tenant/getCurrentOrganization");

    const company = await withTestTenant(orgAId, async () => {
      const created = await resolveOrCreateCompany({
        name: "Research Isolation Co",
        website: "https://research-isolation.com",
      });
      expect(created).toBeTruthy();

      const sources = [
        {
          url: "https://research-isolation.com",
          title: "Homepage",
          publisher: null,
          sourceType: "COMPANY_WEBSITE" as const,
          retrievedAt: new Date().toISOString(),
          supports: ["companySummary"],
        },
      ];

      await saveCompanyResearch({
        companyId: created!.id,
        result: {
          companySummary: "Sells widgets",
          whatTheySell: "Widgets",
          customerTypes: ["SMB"],
          primaryMarkets: ["US"],
          businessModel: "B2B",
          estimatedAov: "$10K–$25K",
          aovReasoning: "Mid-market SaaS pricing page ranges",
          companySizeContext: "50–200 employees",
          relevantTechnologies: ["Salesforce"],
          hiringSignals: [],
          buyingSignals:  ["Hiring SDRs"],
          riskSignals: [],
          confidence: "MEDIUM",
          sources,
        },
      });
      return created!;
    });

    await expect(
      withTestTenant(orgBId, () => getLatestCompanyResearch(company.id)),
    ).rejects.toBeInstanceOf(TenantError);

    const leaked = await prisma.companyResearch.findFirst({
      where: { companyId: company.id, organizationId: orgBId },
    });
    expect(leaked).toBeNull();
  });

  it("Contact cannot attach to another tenant's Company", async () => {
    if (!ready) return;

    const { resolveOrCreateCompany, setContactCompany } = await import(
      "@/lib/tenant/companies"
    );
    const { TenantError } = await import("@/lib/tenant/getCurrentOrganization");

    const companyB = await withTestTenant(orgBId, () =>
      resolveOrCreateCompany({
        name: "Org B Only",
        website: "https://org-b-only.com",
      }),
    );

    const listA = await prisma.contactList.create({
      data: {
        organizationId: orgAId,
        ownerUserId: ownerAId,
        name: `[TEST] Attach List ${suffix}`,
        sourceType: "PASTE",
        totalContacts: 1,
      },
    });
    const contactA = await seedContactOnList(prisma, {
      organizationId: orgAId,
      contactListId: listA.id,
      email: `attach-${suffix}@example.test`,
      company: "Org B Only",
    });

    await expect(
      withTestTenant(orgAId, () => setContactCompany(contactA.id, companyB!.id)),
    ).rejects.toBeInstanceOf(TenantError);
  });

  it("existing usable low-confidence research is reused inside freshness window", async () => {
    if (!ready) return;

    const {
      resolveOrCreateCompany,
      saveCompanyResearch,
      researchCompany,
      getLatestCompanyResearch,
    } = await import("@/lib/tenant/companies");

    await withTestTenant(orgAId, async () => {
      const company = await resolveOrCreateCompany({
        name: "Fresh Research Co",
        website: "https://fresh-research-co.com",
      });

      const saved = await saveCompanyResearch({
        companyId: company!.id,
        result: {
          companySummary: "Fresh summary",
          whatTheySell: "Tools",
          customerTypes: [],
          primaryMarkets: [],
          businessModel: null,
          estimatedAov: "$5K–$15K",
          aovReasoning: "Public pricing tier",
          companySizeContext: null,
          relevantTechnologies: [],
          hiringSignals: [],
          buyingSignals:  [],
          riskSignals: [],
          confidence: "LOW",
          sources: [
            {
              url: "https://fresh-research-co.com/pricing",
              sourceType: "COMPANY_WEBSITE",
              retrievedAt: new Date().toISOString(),
              supports: ["estimatedAov"],
            },
          ],
        },
      });

      const result = await researchCompany(company!.id);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe("fresh");
      expect(result.research?.id).toBe(saved.id);

      const latest = await getLatestCompanyResearch(company!.id);
      expect(latest?.id).toBe(saved.id);
    });
  });

  it("stale research is marked for refresh", async () => {
    if (!ready) return;

    const { resolveOrCreateCompany, needsResearchRefresh } = await import(
      "@/lib/tenant/companies"
    );

    await withTestTenant(orgAId, async () => {
      const company = await resolveOrCreateCompany({
        name: "Stale Research Co",
        website: "https://stale-research-co.com",
      });

      const researchedAt = new Date("2024-01-01T00:00:00.000Z");
      const stale = await prisma.companyResearch.create({
        data: {
          organizationId: orgAId,
          companyId: company!.id,
          status: "COMPLETED",
          researchMethod: "AUTOMATED",
          researchConfidence: "HIGH",
          companySummary: "Old",
          researchedAt,
          expiresAt: new Date("2024-04-01T00:00:00.000Z"),
        },
      });

      expect(needsResearchRefresh(stale)).toBe(true);
    });
  });

  it("manual research update is tenant-scoped", async () => {
    if (!ready) return;

    const { resolveOrCreateCompany, updateManualCompanyResearch } =
      await import("@/lib/tenant/companies");
    const { TenantError } = await import("@/lib/tenant/getCurrentOrganization");

    const company = await withTestTenant(orgAId, async () => {
      const created = await resolveOrCreateCompany({
        name: "Manual Research Co",
        website: "https://manual-research-co.com",
      });

      const updated = await updateManualCompanyResearch({
        companyId: created!.id,
        companySummary: "Manually verified summary",
        whatTheySell: "Consulting",
        estimatedAov: "$25K–$75K",
        aovReasoning: "Enterprise contracts observed",
        customerTypes: ["Enterprise"],
        researchConfidence: "MEDIUM",
      });

      expect(updated.researchMethod).toBe("MANUAL");
      expect(updated.organizationId).toBe(orgAId);
      expect(updated.companySummary).toBe("Manually verified summary");
      return created!;
    });

    await expect(
      withTestTenant(orgBId, () =>
        updateManualCompanyResearch({
          companyId: company.id,
          companySummary: "Leak attempt",
        }),
      ),
    ).rejects.toBeInstanceOf(TenantError);
  });

  it("research source structure is preserved", async () => {
    if (!ready) return;

    const { resolveOrCreateCompany, saveCompanyResearch, getLatestCompanyResearch } =
      await import("@/lib/tenant/companies");

    await withTestTenant(orgAId, async () => {
      const company = await resolveOrCreateCompany({
        name: "Sources Co",
        website: "https://sources-co-test.com",
      });

      const sources = [
        {
          url: "https://sources-co-test.com",
          title: "Home",
          publisher: "Sources Co",
          sourceType: "COMPANY_WEBSITE" as const,
          retrievedAt: "2026-03-20T12:00:00.000Z",
          supports: ["companySummary", "whatTheySell"],
        },
        {
          url: "https://news.example/article",
          title: "Funding",
          publisher: "News",
          sourceType: "NEWS" as const,
          retrievedAt: "2026-03-20T12:00:00.000Z",
          supports: ["buyingSignals"],
        },
      ];

      await saveCompanyResearch({
        companyId: company!.id,
        result: {
          companySummary: "Summary",
          whatTheySell: "Software",
          customerTypes: [],
          primaryMarkets: [],
          businessModel: null,
          estimatedAov: null,
          aovReasoning: null,
          companySizeContext: null,
          relevantTechnologies: [],
          hiringSignals: [],
          buyingSignals:  ["Raised Series B"],
          riskSignals: [],
          confidence: "MEDIUM",
          sources,
        },
        provenance: {
          aiProvider: "openai-compatible",
          aiModel: "research-env-model",
          aiModelUrlIdentifier: "https://research.example/v1/chat/completions",
          promptVersion: "1",
        },
      });

      const latest = await getLatestCompanyResearch(company!.id);
      expect(latest?.sourceCount).toBe(2);
      expect(latest?.researchSources).toEqual(sources);
      expect(latest?.aiProvider).toBe("openai-compatible");
      expect(latest?.aiModel).toBe("research-env-model");
      expect(latest?.promptVersion).toBe("1");
      expect(JSON.stringify(latest)).not.toMatch(/RESEARCH_AI_API_KEY|sk-/i);
    });
  });

  it(
    "multiple Contacts at same Company do not create duplicate research jobs",
    async () => {
      if (!ready) return;

      const {
        associateContactsForList,
        getCompaniesNeedingResearchForScoringRun,
      } = await import("@/lib/tenant/companies");

      const product = await prisma.product.create({
        data: {
          organizationId: orgAId,
          name: `[TEST] Research Product ${suffix}`,
        },
      });
      const icp = await prisma.icp.create({
        data: {
          organizationId: orgAId,
          productId: product.id,
          name: `[TEST] Research ICP ${suffix}`,
        },
      });
      const persona = await prisma.persona.create({
        data: {
          organizationId: orgAId,
          productId: product.id,
          name: `[TEST] Research Persona ${suffix}`,
        },
      });

      const list = await prisma.contactList.create({
        data: {
          organizationId: orgAId,
          ownerUserId: ownerAId,
          name: `[TEST] Multi Contact List ${suffix}`,
          sourceType: "PASTE",
          totalContacts: 3,
        },
      });

      for (let i = 0; i < 3; i += 1) {
        await seedContactOnList(prisma, {
          organizationId: orgAId,
          contactListId: list.id,
          firstName: `Person${i}`,
          lastName: "SameCo",
          email: `sameco-${i}-${suffix}@dup-research.com`,
          company: "Dup Research Inc",
          companyWebsite: "https://www.dup-research.com",
        });
      }

      await withTestTenant(orgAId, async () => {
        const linked = await associateContactsForList(list.id);
        expect(linked.companiesLinked).toBe(1);

        const run = await prisma.scoringRun.create({
          data: {
            organizationId: orgAId,
            contactListId: list.id,
            productId: product.id,
            icpId: icp.id,
            personaId: persona.id,
            status: "PENDING",
            totalContacts: 3,
            scoredContacts: 0,
            productSnapshot: {},
            icpSnapshot: {},
            personaSnapshot: {},
          },
        });

        const plan = await getCompaniesNeedingResearchForScoringRun(run.id);
        expect(plan.totalContacts).toBe(3);
        expect(plan.uniqueCompanies).toBe(1);
        expect(plan.needingResearch).toBe(1);
      });
    },
    30_000,
  );

  it("multiple Lists reuse same CompanyResearch", async () => {
    if (!ready) return;

    const {
      resolveOrCreateCompany,
      saveCompanyResearch,
      associateContactWithCompany,
      getLatestCompanyResearch,
    } = await import("@/lib/tenant/companies");

    await withTestTenant(orgAId, async () => {
      const company = await resolveOrCreateCompany({
        name: "Multi List Co",
        website: "https://multi-list-co.com",
      });

      await saveCompanyResearch({
        companyId: company!.id,
        result: {
          companySummary: "Shared across lists",
          whatTheySell: "Platform",
          customerTypes: [],
          primaryMarkets: [],
          businessModel: null,
          estimatedAov: "$20K–$40K",
          aovReasoning: "Annual seats",
          companySizeContext: null,
          relevantTechnologies: [],
          hiringSignals: [],
          buyingSignals:  [],
          riskSignals: [],
          confidence: "MEDIUM",
          sources: [
            {
              url: "https://multi-list-co.com",
              sourceType: "COMPANY_WEBSITE",
              retrievedAt: new Date().toISOString(),
              supports: ["companySummary"],
            },
          ],
        },
      });

      const list1 = await prisma.contactList.create({
        data: {
          organizationId: orgAId,
          ownerUserId: ownerAId,
          name: `[TEST] List1 ${suffix}`,
          sourceType: "PASTE",
          totalContacts: 1,
        },
      });
      const list2 = await prisma.contactList.create({
        data: {
          organizationId: orgAId,
          ownerUserId: ownerAId,
          name: `[TEST] List2 ${suffix}`,
          sourceType: "UPLOAD",
          totalContacts: 1,
        },
      });

      const c1 = await seedContactOnList(prisma, {
        organizationId: orgAId,
        contactListId: list1.id,
        email: `l1-${suffix}@multi-list-co.com`,
        company: "Multi List Co",
        companyWebsite: "https://multi-list-co.com",
      });
      const c2 = await seedContactOnList(prisma, {
        organizationId: orgAId,
        contactListId: list2.id,
        email: `l2-${suffix}@multi-list-co.com`,
        company: "Multi List Co",
        companyWebsite: "https://www.multi-list-co.com",
      });

      const linked1 = await associateContactWithCompany(c1.id);
      const linked2 = await associateContactWithCompany(c2.id);
      expect(linked1?.id).toBe(company?.id);
      expect(linked2?.id).toBe(company?.id);

      const research1 = await getLatestCompanyResearch(linked1!.id);
      const research2 = await getLatestCompanyResearch(linked2!.id);
      expect(research1?.id).toBe(research2?.id);
      expect(research1?.companySummary).toBe("Shared across lists");
    });
  });

  it("freshness prevents unnecessary research and force refresh bypasses it", async () => {
    if (!ready) return;
    process.env.RESEARCH_AI_PROVIDER = "openai-compatible";
    process.env.RESEARCH_AI_MODEL = "research-model";
    process.env.RESEARCH_AI_MODEL_URL =
      "https://research.example/v1/chat/completions";
    process.env.RESEARCH_AI_API_KEY = "research-key";

    const {
      resolveOrCreateCompany,
      saveCompanyResearch,
      researchCompany,
    } = await import("@/lib/tenant/companies");
    const { setCompanyResearchProvider } = await import(
      "@/lib/research/provider"
    );

    let calls = 0;
    setCompanyResearchProvider({
      async research() {
        calls += 1;
        throw new Error("should not be called when fresh");
      },
    });

    try {
      await withTestTenant(orgAId, async () => {
        const company = await resolveOrCreateCompany({
          name: "Fresh Guard Co",
          website: "https://fresh-guard-co.com",
        });

        const saved = await saveCompanyResearch({
          companyId: company!.id,
          result: {
            companySummary: "Keep me",
            whatTheySell: "Software",
            customerTypes: [],
            primaryMarkets: [],
            businessModel: null,
            estimatedAov: null,
            aovReasoning: null,
            companySizeContext: null,
            relevantTechnologies: [],
            hiringSignals: [],
          buyingSignals:  [],
            riskSignals: [],
            confidence: "HIGH",
            sources: [
              {
                url: "https://fresh-guard-co.com",
                sourceType: "COMPANY_WEBSITE",
                retrievedAt: new Date().toISOString(),
                supports: ["companySummary"],
              },
            ],
          },
        });

        const skipped = await researchCompany(company!.id);
        expect(skipped.skipped).toBe(true);
        expect(skipped.reason).toBe("fresh");
        expect(calls).toBe(0);

        setCompanyResearchProvider({
          async research() {
            calls += 1;
            throw new Error("forced refresh failure");
          },
        });

        const refreshed = await researchCompany(company!.id, { force: true });
        expect(calls).toBe(1);
        expect(refreshed.refreshFailed).toBe(true);
        expect(refreshed.research?.id).toBe(saved.id);
        expect(refreshed.research?.companySummary).toBe("Keep me");
      });
    } finally {
      setCompanyResearchProvider(null);
    }
  });
});

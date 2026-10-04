import { describe, expect, it } from "vitest";
import {
  allocateExcerptBudget,
  htmlToTextSnippet,
  parseStubCanonicalUrl,
  sameRegistrableDomain,
  WEBSITE_EVIDENCE_PER_PAGE_CHAR_CAP,
  WEBSITE_EVIDENCE_TOTAL_CHAR_BUDGET,
} from "@/lib/research/sources";

describe("website evidence budget", () => {
  it("keeps the homepage and about page ahead of products within the combined budget", () => {
    const excerpts = allocateExcerptBudget([
      {
        slot: "homepage",
        url: "https://acme.example/",
        title: "Home",
        text: "h".repeat(10_000),
      },
      {
        slot: "products",
        url: "https://acme.example/products",
        title: "Products",
        text: "p".repeat(4_000),
      },
      {
        slot: "about",
        url: "https://acme.example/about",
        title: "About",
        text: "a".repeat(4_000),
      },
    ]);

    expect(excerpts.reduce((n, e) => n + e.text.length, 0)).toBe(
      WEBSITE_EVIDENCE_TOTAL_CHAR_BUDGET,
    );
    expect(excerpts[0]?.url).toBe("https://acme.example/");
    expect(excerpts[1]?.url).toContain("/about");
    expect(excerpts[2]?.url).toContain("/products");
    expect(excerpts[2]?.text.length).toBe(2_000);
  });

  it("cuts one page at 4,000 characters and the combined excerpts at 16,000", () => {
    expect(WEBSITE_EVIDENCE_PER_PAGE_CHAR_CAP).toBe(4_000);
    expect(WEBSITE_EVIDENCE_TOTAL_CHAR_BUDGET).toBe(16_000);
    expect(htmlToTextSnippet("y".repeat(9_000)).length).toBe(4_000);

    const page = "z".repeat(4_000);
    const excerpts = allocateExcerptBudget([
      {
        slot: "jobFocus",
        url: "https://acme.example/brand",
        title: "Brand",
        text: page,
      },
      {
        slot: "products",
        url: "https://acme.example/products",
        title: "Products",
        text: page,
      },
      {
        slot: "about",
        url: "https://acme.example/about",
        title: "About",
        text: page,
      },
      {
        slot: "company",
        url: "https://acme.example/company",
        title: "Company",
        text: page,
      },
      {
        slot: "homepage",
        url: "https://acme.example/",
        title: "Home",
        text: page,
      },
    ]);
    expect(excerpts.reduce((n, excerpt) => n + excerpt.text.length, 0)).toBe(16_000);
    expect(excerpts.every((excerpt) => excerpt.text.length === 4_000)).toBe(true);
    expect(excerpts.some((excerpt) => excerpt.url === "https://acme.example/")).toBe(
      true,
    );
    expect(excerpts.some((excerpt) => excerpt.url.endsWith("/company"))).toBe(false);
  });

  it("caps per-page text via htmlToTextSnippet", () => {
    expect(htmlToTextSnippet("x".repeat(5000), 1200).length).toBe(1200);
  });
});

describe("sameRegistrableDomain", () => {
  it("treats www and bare host as same", () => {
    expect(sameRegistrableDomain("www.acme.com", "acme.com")).toBe(true);
  });

  it("treats subdomains as same site", () => {
    expect(sameRegistrableDomain("blog.acme.com", "acme.com")).toBe(true);
  });

  it("treats different domains as different", () => {
    expect(sameRegistrableDomain("stoneeagle.com", "se-fi.com")).toBe(false);
  });
});

describe("parseStubCanonicalUrl", () => {
  it("follows one HTTPS link on a different registrable domain", () => {
    const html =
      '<html><body><a href="https://www.se-fi.com/">Return to StoneEagle</a></body></html>';
    expect(parseStubCanonicalUrl(html, "https://stoneeagle.com")).toBe(
      "https://www.se-fi.com/",
    );
  });

  it("rejects same-domain links", () => {
    const html =
      '<html><body><a href="https://stoneeagle.com/products">Products</a></body></html>';
    expect(parseStubCanonicalUrl(html, "https://stoneeagle.com")).toBeNull();
  });

  it("rejects non-HTTPS links", () => {
    const html =
      '<html><body><a href="http://www.se-fi.com/">Insecure</a></body></html>';
    expect(parseStubCanonicalUrl(html, "https://stoneeagle.com")).toBeNull();
  });

  it("rejects internal/private URLs blocked by url safety", () => {
    const html =
      '<html><body><a href="https://localhost/login">Local</a></body></html>';
    expect(parseStubCanonicalUrl(html, "https://stoneeagle.com")).toBeNull();
  });
});

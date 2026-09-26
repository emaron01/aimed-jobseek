import { describe, expect, it } from "vitest";
import { applicationPageTitle, polishCopy } from "@/lib/product-config/polish";
import { brand } from "@/lib/product-config/brand";

describe("polish chrome", () => {
  it("names the browser tab with the page and application", () => {
    expect(applicationPageTitle("Company", "Director of Sales — Northline")).toBe(
      "Company · Director of Sales — Northline",
    );
    expect(applicationPageTitle("Home", "")).toBe(`Home · ${brand.appName}`);
  });

  it("rejects a blank page title", () => {
    expect(() => applicationPageTitle("  ", "Northline")).toThrow(/page title/i);
  });

  it("keeps Generate as the shared AI verb", () => {
    expect(polishCopy.generate).toBe("Generate");
    expect(polishCopy.regenerate).toBe("Regenerate");
  });
});

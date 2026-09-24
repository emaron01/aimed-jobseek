import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("contacts page filters", () => {
  it("filters by application and has no list filters", () => {
    const page = readFileSync("src/app/(app)/contacts/page.tsx", "utf8");
    expect(page).toContain('name="campaignId"');
    expect(page).toContain("All {vocab.campaign.plural}");
    expect(page).toContain("listContacts({");
    expect(page).toContain("campaignId");
    expect(page).not.toContain("listContactLists");
    expect(page).not.toMatch(/\blistId\b/);
    expect(page).not.toContain("Show unlisted");
    expect(page).not.toContain("All {vocab.list.plural}");
  });
});

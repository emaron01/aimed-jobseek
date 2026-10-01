import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("contacts page filters", () => {
  it("filters by application and has no list filters", () => {
    const page = readFileSync("src/app/(app)/contacts/page.tsx", "utf8");
    const directory = readFileSync("src/components/ContactsDirectory.tsx", "utf8");
    expect(directory).toContain('name="campaignId"');
    expect(directory).toContain("All {vocab.campaign.plural}");
    expect(page).toContain("listContacts({");
    expect(page).toContain("campaignId");
    expect(directory).toContain("workspaceContactEditHref");
    expect(directory).toContain("edit-contact-");
    expect(page).not.toContain("listContactLists");
    expect(page).not.toMatch(/\blistId\b/);
    expect(directory).not.toContain("Show unlisted");
    expect(directory).not.toContain("All {vocab.list.plural}");
  });
});

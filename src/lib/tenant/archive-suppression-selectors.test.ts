/**
 * Selector audit: archived campaigns/lists and suppressed contacts are
 * filtered at every selection surface (not only the pages we changed).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("archived and suppressed selector audit", () => {
  it("home and campaign list hide archived campaigns by default", () => {
    const home = read("src/lib/workflow/home.ts");
    const list = read("src/lib/tenant/data.ts");
    const homePage = read("src/app/(app)/page.tsx");
    const campaignsPage = read("src/app/(app)/campaigns/page.tsx");
    expect(home).toContain("includeArchived");
    expect(home).toContain("archivedAt: null");
    expect(list).toMatch(/listCampaigns[\s\S]*archivedAt:\s*null/);
    expect(homePage).toContain("ShowArchivedToggle");
    expect(campaignsPage).toContain("ShowArchivedToggle");
    expect(campaignsPage).toContain("listCampaigns({");
    expect(campaignsPage).toContain("includeArchived");
  });

  it("list selectors hide archived lists by default", () => {
    const data = read("src/lib/tenant/data.ts");
    const listsPage = read("src/app/(app)/lists/page.tsx");
    const contactsPage = read("src/app/(app)/contacts/page.tsx");
    const scorePage = read("src/app/(app)/lists/[id]/score/page.tsx");
    expect(data).toMatch(/listContactLists[\s\S]*archivedAt:\s*null/);
    expect(data).toContain("This ${vocab.list.singular} is archived and is read-only");
    expect(listsPage).toContain("ShowArchivedToggle");
    expect(contactsPage).not.toContain("listContactLists");
    expect(contactsPage).not.toContain("listId");
    expect(contactsPage).toContain("campaignId");
    expect(scorePage).toContain("list.archivedAt");
  });

  it("campaign stage 5 and scoring-run add exclude archived lists and suppressions", () => {
    const contacts = read("src/lib/campaign/contacts.ts");
    expect(contacts).toContain("contactList: { archivedAt: null }");
    expect(contacts).toContain("memberships");
    expect(contacts).toContain("normalizedEmail");
    expect(contacts).toContain("listActiveNormalizedEmails");
    expect(contacts).toContain("contactMatchesSuppressionSet");
    expect(contacts).toContain("assertCampaignNotArchived");
  });

  it("campaign create, email generation, and sequence follow-ups have no list picker; generation/send block suppression", () => {
    const newCampaign = read("src/components/NewCampaignForm.tsx");
    expect(newCampaign).not.toMatch(/contactListId|listId/);
    const generate = read("src/lib/email-generation/service.ts");
    expect(generate).toContain("assertEmailNotSuppressed");
    expect(generate).toContain("assertCampaignNotArchived");
    const sequence = read("src/lib/email-generation/sequence.ts");
    expect(sequence).toContain("assertEmailNotSuppressed");
    const send = read("src/lib/mailbox/send.ts");
    expect(send).toContain("assertEmailNotSuppressed");
    const followUp = read("src/app/actions/email.ts");
    expect(followUp).toContain("addFollowUpEmailAction");
    expect(followUp).toContain("generateEmailDraft");
  });

  it("scoring page is a historical report (archived lists remain viewable)", () => {
    const report = read("src/app/(app)/scoring/[runId]/page.tsx");
    expect(report).toContain("ScoreReportClient");
    expect(report).toContain("listActiveNormalizedEmails");
  });
});

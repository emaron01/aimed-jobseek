import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONTACT_OUTBOUND_PURGE_CONFIRM_PHRASE,
  contactOutboundPurgeConfirmSummary,
} from "@/lib/platform/purge-contact-outbound-shared";
import { vocab } from "@/lib/product-config";

describe("contact outbound purge policy", () => {
  it("names suppressions in the DELETE list", () => {
    const summary = contactOutboundPurgeConfirmSummary();
    expect(
      summary.deletes.some((line) => /suppression|opt-out/i.test(line)),
    ).toBe(true);
    expect(
      summary.keeps.some((line) => /product|persona/i.test(line)),
    ).toBe(true);
    expect(CONTACT_OUTBOUND_PURGE_CONFIRM_PHRASE).toBe(`Purge ${vocab.contact.plural}`);
  });

  it("wires platform panel and audit action", () => {
    const page = readFileSync("src/app/platform/orgs/[id]/page.tsx", "utf8");
    const actions = readFileSync("src/app/actions/platform-orgs.ts", "utf8");
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(page).toContain("PurgeContactOutboundPanel");
    expect(actions).toContain("purgeContactOutboundDataAction");
    expect(schema).toContain("PLATFORM_CONTACT_OUTBOUND_PURGED");
  });

  it("billing copy describes read-only retention (B3), not selective suppression purge", () => {
    const billing = readFileSync(
      "src/app/(app)/settings/billing/page.tsx",
      "utf8",
    );
    // Account lifecycle B3 replaced cancel/past-due lock copy with read-only
    // + 30-day full retention messaging (selective contact purge is B6).
    expect(billing).toContain("ACCOUNT_READ_ONLY_BANNER_MESSAGE");
    expect(billing).toContain("accountCancelScheduledMessage");
    expect(billing).not.toMatch(/opt-out|suppression/i);
  });

  it("extends credit packs on CANCELED → live sync", () => {
    const sync = readFileSync("src/lib/billing/sync-subscription.ts", "utf8");
    expect(sync).toContain("extendCompanyResearchCreditsAfterCancelLapse");
    expect(sync).toContain('billingStatus === "CANCELED"');
  });

  it("surfaces purge-eligible orgs on platform home and orgs list", () => {
    const home = readFileSync("src/app/platform/page.tsx", "utf8");
    const orgs = readFileSync("src/app/platform/orgs/page.tsx", "utf8");
    expect(home).toContain("listPurgeEligibleOrganizations");
    expect(home).toContain("platform-purge-eligible");
    expect(orgs).toContain("listPurgeEligibleOrganizations");
    expect(orgs).toContain("Eligible");
  });

  it("uses Stripe canceled_at for purge clock on delete fallback", () => {
    const sync = readFileSync("src/lib/billing/sync-subscription.ts", "utf8");
    const webhook = readFileSync(
      "src/lib/billing/handle-stripe-webhook.ts",
      "utf8",
    );
    expect(sync).toContain("unixToDate(subscription.canceled_at)");
    expect(sync).toContain("canceledAt: canceledAt ?? new Date()");
    expect(webhook).toContain("canceledAt: subscription.canceled_at");
  });
});

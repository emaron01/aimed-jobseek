import { describe, expect, it } from "vitest";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";
import {
  extractContactDetailsFromText,
  fillMissingContactDetails,
  missingResumeHeaderContacts,
} from "@/lib/product-research/contact-extract";
import { applyProfileContactHeader } from "@/lib/application-assets/header";
import { applicationAssetConfig } from "@/lib/product-config";

describe("resume header contact details", () => {
  it("extracts city and state, phone, email, and LinkedIn without a street address", () => {
    const extracted = extractContactDetailsFromText(`
      Alex Chen
      14 Oak Street
      Austin, TX
      512-555-0148
      alex.chen@example.com
      https://www.linkedin.com/in/alexchen
    `);
    expect(extracted.cityState).toBe("Austin, TX");
    expect(extracted.phone).toContain("512");
    expect(extracted.email).toBe("alex.chen@example.com");
    expect(extracted.linkedinUrl).toMatch(/linkedin.com\/in\/alexchen/i);
  });

  it("fills missing identity FACT fields from sources and does not overwrite seeker-edited values", () => {
    const profile = fixtureAlexChenProfile();
    const editedEmail = {
      id: "id_email_seeker",
      kind: "FACT" as const,
      text: "seeker-edited@example.com",
      provenance: [{ sourceId: "src_resume_alex_chen" }],
    };
    const empty = {
      ...profile,
      identity: {
        ...profile.identity,
        email: editedEmail,
        phone: null,
        cityState: null,
        linkedinUrl: null,
      },
    };
    const restored = fillMissingContactDetails(empty, [
      {
        sourceId: "src-resume",
        text: "Alex Chen\nAustin, TX\n512-555-0148\nalex.chen@example.com\nhttps://www.linkedin.com/in/alexchen",
      },
    ]);
    expect(restored.profile.identity.email?.text).toBe(editedEmail?.text);
    expect(restored.filled).toEqual(
      expect.arrayContaining(["phone", "cityState", "linkedinUrl"]),
    );
    expect(restored.filled).not.toContain("email");
  });

  it("names missing resume header details and injects present profile facts into the header", () => {
    const profile = fixtureAlexChenProfile();
    const missing = missingResumeHeaderContacts({
      ...profile,
      identity: { ...profile.identity, phone: null },
    });
    expect(missing).toContain("phone");
    expect(applicationAssetConfig.missingContact.phone).toBe("phone");
    const applied = applyProfileContactHeader(
      {
        type: "RESUME",
        header: {
          name: {
            id: "name",
            text: profile.identity.name?.text ?? "Alex Chen",
            supports: [{ sourceId: "profile:name", quote: "Alex Chen" }],
          },
          contactDetails: [],
        },
      },
      profile,
    );
    const header = (
      applied as {
        header: { contactDetails: Array<{ text: string }> };
      }
    ).header;
    const texts = header.contactDetails.map((claim) => claim.text);
    expect(texts.length).toBeGreaterThan(0);
  });
});

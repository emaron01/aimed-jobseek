import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyProfileContactHeader,
  missingResumeContactLabels,
} from "@/lib/application-assets/header";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";
import {
  missingResumeHeaderContacts,
} from "@/lib/product-research/contact-extract";
import { parseCandidateProfileFromFormData } from "@/lib/product-research/review";
import { mergeProtectedProductDraftFields } from "@/lib/product-research/resynthesize-approved-plan";
import {
  applySeekerEditProvenance,
  mergeManuallyEditedFields,
} from "@/lib/product-research/seeker-edit";

const SEEKER_SOURCE = "src_seeker_edit";

const SALES_FIELD_PATTERNS = [
  /Typical Price \/ AOV/,
  /name=["']averageOrderValue["']/,
  /Primary Value Proposition/,
  /name=["']valueProposition["']/,
];

function walkTsx(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsx(full, acc);
      continue;
    }
    if (entry.name.endsWith(".tsx")) acc.push(full.replace(/\\/g, "/"));
  }
  return acc;
}

function formFromProfile(profile: unknown): FormData {
  const form = new FormData();
  form.set("candidateProfileJson", JSON.stringify(profile));
  return form;
}

describe("seeker-facing Personal Profile, Target Employers, and Hiring Team", () => {
  const seekerFacing = [
    "src/components/CandidateProfileEditForm.tsx",
    "src/app/(app)/setup/[productId]/edit/page.tsx",
    "src/app/(app)/setup/[productId]/page.tsx",
    "src/components/ProductDraftReview.tsx",
    "src/components/AssistedProductSetup.tsx",
    "src/components/IcpDetailsForm.tsx",
    "src/components/PersonaForm.tsx",
    "src/components/ApplicationAssetsSection.tsx",
    ...walkTsx("src/app/(app)/setup"),
    ...walkTsx("src/app/(app)/setup/[productId]/icps"),
    ...walkTsx("src/app/(app)/setup/[productId]/personas"),
  ];

  it("shows candidate fields only and never renders product price or AOV", () => {
    const form = readFileSync(
      "src/components/CandidateProfileEditForm.tsx",
      "utf8",
    );
    expect(form).toContain("candidateProfileEditCopy.identityTitle");
    expect(form).toContain("candidateProfileEditCopy.directionTitle");
    expect(form).toContain("candidateProfileEditCopy.experienceTitle");
    expect(form).toContain("candidateProfileEditCopy.extrasTitle");
    expect(form).toContain("candidateProfileEditCopy.fullName");
    expect(form).toContain("candidateProfileEditCopy.headline");
    expect(form).toContain("candidateProfileEditCopy.cityState");
    expect(form).toContain("candidateProfileEditCopy.phone");
    expect(form).toContain("candidateProfileEditCopy.email");
    expect(form).toContain("candidateProfileEditCopy.linkedinUrl");
    expect(form).toContain("candidateProfileEditCopy.personalWebsite");
    expect(form).toContain("candidateProfileEditCopy.positioning");
    expect(form).toContain("candidateProfileEditCopy.targetTitles");
    expect(form).toContain("candidateProfileEditCopy.functions");
    expect(form).toContain("candidateProfileEditCopy.seniority");
    expect(form).toContain("candidateProfileEditCopy.goals");
    expect(form).toContain("candidateProfileEditCopy.employer");
    expect(form).toContain("candidateProfileEditCopy.startDate");
    expect(form).toContain("candidateProfileEditCopy.endDate");
    expect(form).toContain("candidateProfileEditCopy.achievements");
    expect(form).toContain("candidateProfileEditCopy.skills");
    expect(form).toContain("candidateProfileEditCopy.education");
    expect(form).toContain("candidateProfileEditCopy.credentials");
    expect(form).toContain("candidateProfileEditCopy.awards");
    expect(form).not.toContain("Website URL");
    expect(form).not.toContain("Personal Profile Name");
    expect(form).not.toContain("Personal Profile Description");

    const unique = [...new Set(seekerFacing)];
    for (const file of unique) {
      const source = readFileSync(file, "utf8");
      for (const pattern of SALES_FIELD_PATTERNS) {
        expect(source, `${file} still has ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});

describe("role dates", () => {
  it("saves year-only and Present exactly as written", () => {
    const current = fixtureAlexChenProfile();
    const drafted = {
      ...current,
      experience: current.experience.map((role, index) =>
        index === 0
          ? { ...role, startDate: "2021", endDate: "Present" }
          : { ...role, startDate: "2017", endDate: "2020" },
      ),
    };
    const parsed = parseCandidateProfileFromFormData(formFromProfile(drafted));
    const confirmed = applySeekerEditProvenance(parsed, SEEKER_SOURCE);

    expect(parsed.experience[0]?.startDate).toBe("2021");
    expect(parsed.experience[0]?.endDate).toBe("Present");
    expect(parsed.experience[1]?.startDate).toBe("2017");
    expect(parsed.experience[1]?.endDate).toBe("2020");
    expect(confirmed.experience[0]?.startDate).toBe("2021");
    expect(confirmed.experience[0]?.endDate).toBe("Present");
    expect(confirmed.experience[0]?.kind).toBe("FACT");
    expect(confirmed.experience[0]?.provenance).toEqual(
      expect.arrayContaining([{ sourceId: SEEKER_SOURCE }]),
    );
  });
});

describe("seeker edits survive rebuild", () => {
  it("keeps FACT seeker edits when those fields are protected", () => {
    const current = fixtureAlexChenProfile();
    const seeker = applySeekerEditProvenance(
      {
        ...current,
        positioning: {
          ...current.positioning!,
          text: "Seeker-written positioning.",
        },
        experience: current.experience.map((role, index) =>
          index === 0
            ? { ...role, startDate: "2021", endDate: "Present" }
            : role,
        ),
      },
      SEEKER_SOURCE,
    );
    const proposed = {
      ...current,
      positioning: {
        ...current.positioning!,
        text: "Model-rewritten positioning.",
      },
      experience: current.experience.map((role, index) =>
        index === 0
          ? { ...role, startDate: "2021-03", endDate: "2026-01" }
          : role,
      ),
    };

    const merged = mergeProtectedProductDraftFields({
      current: seeker,
      proposed,
      manuallyEditedFields: mergeManuallyEditedFields(
        ["positioning"],
        ["experience"],
      ),
    });

    expect(merged.positioning?.text).toBe("Seeker-written positioning.");
    expect(merged.experience[0]?.startDate).toBe("2021");
    expect(merged.experience[0]?.endDate).toBe("Present");
    expect(merged.experience[0]?.kind).toBe("FACT");
  });
});

describe("optional LinkedIn", () => {
  it("does not warn when LinkedIn or a personal website is missing", () => {
    const base = fixtureAlexChenProfile();
    const profile = {
      ...base,
      identity: {
        ...base.identity,
        email: {
          id: "id_email",
          kind: "FACT" as const,
          text: "alex.chen@example.com",
          provenance: [{ sourceId: "src_resume_alex_chen" }],
        },
        linkedinUrl: null,
        personalSite: null,
        phone: null,
      },
    };
    expect(missingResumeHeaderContacts(profile)).toEqual(["phone"]);
    const labels = missingResumeContactLabels(profile);
    expect(labels).toEqual(["phone"]);
    expect(labels.join(" ")).not.toMatch(/linkedin/i);
    expect(labels.join(" ")).not.toMatch(/website/i);

    const applied = applyProfileContactHeader(
      {
        type: "RESUME",
        header: {
          name: {
            id: "name",
            text: "Alex Chen",
            supports: [{ sourceId: "profile:name", quote: "Alex Chen" }],
          },
          contactDetails: [],
        },
      },
      profile,
    );
    const texts = (
      applied as { header: { contactDetails: Array<{ text: string }> } }
    ).header.contactDetails.map((claim) => claim.text);
    expect(texts.join(" ")).not.toMatch(/linkedin/i);
    expect(texts).toContain("Seattle, WA");
    expect(texts).toContain("alex.chen@example.com");
  });
});

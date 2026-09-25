import type { CommonGroundItem, LinkedInExtracted } from "@/lib/contact-profile/contract";
import type { CandidateProfile } from "@/lib/product-research/candidate-profile";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function exactOverlap(left: string, right: string): boolean {
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a) && a === b;
}

function unique(items: CommonGroundItem[]): CommonGroundItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalize(item.text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function commonGroundFromProfiles(input: {
  extracted: LinkedInExtracted;
  profile: CandidateProfile;
}): CommonGroundItem[] {
  const overlaps: CommonGroundItem[] = [];
  const contactEmployers = [
    input.extracted.currentEmployer?.text,
    ...input.extracted.priorRoles.map((role) => role.employer.text),
  ].filter((value): value is string => Boolean(value));
  const contactTitles = [
    input.extracted.currentTitle?.text,
    ...input.extracted.priorRoles.map((role) => role.title?.text),
  ].filter((value): value is string => Boolean(value));
  const contactSchools = input.extracted.education.map((item) => item.text);
  const contactFocus = input.extracted.statedFocus.map((item) => item.text);

  for (const role of input.profile.experience) {
    const employer = role.employer?.trim();
    const title = role.title?.trim();
    if (employer) {
      const match = contactEmployers.find((item) => exactOverlap(item, employer));
      if (match) {
        overlaps.push({
          text: employer,
          seekerSource: `Personal Profile experience at ${employer}`,
          contactSource: `LinkedIn paste employer ${match}`,
        });
      }
    }
    if (title) {
      const match = contactTitles.find((item) => exactOverlap(item, title));
      if (match) {
        overlaps.push({
          text: title,
          seekerSource: `Personal Profile role ${title}`,
          contactSource: `LinkedIn paste title ${match}`,
        });
      }
    }
  }

  for (const school of input.profile.education) {
    const match = contactSchools.find((item) => exactOverlap(item, school.text));
    if (match) {
      overlaps.push({
        text: school.text,
        seekerSource: `Personal Profile education ${school.text}`,
        contactSource: `LinkedIn paste education ${match}`,
      });
    }
  }

  for (const functionName of input.profile.direction.functions) {
    const match = contactFocus.find((item) => exactOverlap(item, functionName.text));
    if (match) {
      overlaps.push({
        text: functionName.text,
        seekerSource: `Personal Profile industry or function ${functionName.text}`,
        contactSource: `LinkedIn paste stated focus ${match}`,
      });
    }
  }

  return unique(overlaps);
}

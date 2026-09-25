import type { ReadyApplicationGenerationContext } from "@/lib/generation/context";
import {
  factsSupportedBySources,
  hasVisibleText,
  knownNamesFromProfile,
  type KnownNames,
} from "@/lib/grounding/fact-tokens";
import {
  applicationAssetConfig,
  consultationConfig,
  vocab,
} from "@/lib/product-config";
import {
  formatAssetSourceKind,
  sanitizeAssetContent,
} from "@/lib/application-assets/display";
import type { ApplicationAssetContent, AssetClaim } from "./contract";

export { sanitizeAssetContent };

export type ClaimViolationDetail = {
  claimId: string;
  claimText: string;
  sourceId: string | null;
  sourceLabel: string;
  reason: string;
};

export function logRejectedClaim(input: {
  claimText: string;
  sourceId: string | null;
  sourceLabel: string;
  reason: string;
}): void {
  console.info(
    JSON.stringify({
      event: "asset_claim_rejected",
      claimText: input.claimText,
      citedSource: input.sourceId ?? input.sourceLabel,
      reason: input.reason,
    }),
  );
}

export function formatClaimViolation(detail: ClaimViolationDetail): string {
  const source = detail.sourceLabel || "the cited source";
  const claim = hasVisibleText(detail.claimText)
    ? `“${detail.claimText.trim()}”`
    : `claim ${detail.claimId}`;
  return `Claim ${detail.claimId}: ${claim} was checked against ${source}: ${detail.reason}`;
}

export function formatAssetVerificationMessage(violations: string[]): string {
  const lines = [
    applicationAssetConfig.labels.verificationFailed,
    ...violations.filter((item) => hasVisibleText(item)),
    applicationAssetConfig.labels.violationFix
      .replace("{consultant}", consultationConfig.displayName)
      .replace("{product}", vocab.product.singular),
  ];
  return lines.join("\n");
}

export function sourceCorpusForClaim(
  source: ReadyApplicationGenerationContext["sources"][number],
  profile: ReadyApplicationGenerationContext["profile"],
): string {
  const extras: string[] = [source.text];
  if (source.id.startsWith("profile:")) {
    const factId = source.id.slice("profile:".length);
    const role = profile.experience.find(
      (item) =>
        item.id === factId ||
        item.achievements.some((achievement) => achievement.id === factId),
    );
    if (role) {
      extras.push(
        [role.employer, role.title, role.startDate, role.endDate, role.location]
          .filter(Boolean)
          .join(" "),
      );
    }
  }
  return extras.filter(Boolean).join("\n");
}

export function knownNamesFromContext(
  context: ReadyApplicationGenerationContext,
): KnownNames {
  const known = knownNamesFromProfile(context.profile);
  const jobTitle = context.requirement?.title?.trim();
  const jobCompany = context.requirement?.companyName?.trim();
  return {
    employers: jobCompany ? [...known.employers, jobCompany] : known.employers,
    titles: jobTitle ? [...known.titles, jobTitle] : known.titles,
  };
}

export function deterministicClaimViolations(input: {
  claims: AssetClaim[];
  context: ReadyApplicationGenerationContext;
}): ClaimViolationDetail[] {
  const sourceById = new Map(input.context.sources.map((source) => [source.id, source]));
  const known = knownNamesFromContext(input.context);
  const details: ClaimViolationDetail[] = [];
  for (const claim of input.claims) {
    if (!hasVisibleText(claim.text)) continue;
    const cited = claim.supports
      .map((support) => sourceById.get(support.sourceId))
      .filter((source): source is NonNullable<typeof source> => Boolean(source));
    if (cited.length === 0) continue;
    const corpus = cited.map((source) => sourceCorpusForClaim(source, input.context.profile));
    const result = factsSupportedBySources(claim.text, corpus, known);
    if (result.ok) continue;
    const primary = cited[0]!;
    details.push({
      claimId: claim.id,
      claimText: claim.text.trim(),
      sourceId: primary.id,
      sourceLabel: formatAssetSourceKind(primary.id),
      reason: result.reason ?? "the facts do not match the cited source",
    });
  }
  return details;
}

export function claimIdsFromViolations(violations: string[]): Set<string> {
  return new Set(
    violations.flatMap((message) => {
      const match = message.match(/^Claim (\S+)/);
      return match?.[1] ? [match[1]] : [];
    }),
  );
}

export function claimIdSetFromDetails(
  details: ClaimViolationDetail[],
): Set<string> {
  return new Set(details.map((item) => item.claimId));
}

export function stripClaimsById(
  content: ApplicationAssetContent,
  drop: Set<string>,
): ApplicationAssetContent {
  if (drop.size === 0) return content;
  const keep = (claim: AssetClaim) => !drop.has(claim.id);
  if (content.type === "COVER_LETTER") {
    return sanitizeAssetContent({
      ...content,
      paragraphs: content.paragraphs.filter(keep),
    });
  }
  if (content.type !== "RESUME") return content;
  return sanitizeAssetContent({
    ...content,
    summary: content.summary.filter(keep),
    skills: content.skills.filter(keep),
    education: content.education.filter(keep),
    credentials: content.credentials.filter(keep),
    experience: content.experience.map((role) => ({
      ...role,
      bullets: role.bullets.filter(keep),
    })),
  });
}

export function visibleClaims(claims: AssetClaim[]): AssetClaim[] {
  return claims.filter((claim) => hasVisibleText(claim.text));
}

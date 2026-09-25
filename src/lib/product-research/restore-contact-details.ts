import type { CandidateProfile } from "@/lib/product-research/candidate-profile";
import { fillMissingContactDetails } from "@/lib/product-research/contact-extract";
import { prisma } from "@/lib/prisma-client";

export async function persistExtractedContactDetails(input: {
  organizationId: string;
  productId: string;
  profile: CandidateProfile;
}): Promise<CandidateProfile> {
  const missing = ["email", "phone", "cityState", "linkedinUrl"].some(
    (key) => !input.profile.identity[key as "email"]?.text.trim(),
  );
  if (!missing) return input.profile;
  const sources = await prisma.productSource.findMany({
    where: {
      organizationId: input.organizationId,
      productId: input.productId,
    },
    select: { id: true, extractedText: true },
  });
  const texts = sources
    .map((source) => ({
      sourceId: source.id,
      text: source.extractedText?.trim() ?? "",
    }))
    .filter((source) => source.text.length > 0);
  if (texts.length === 0) return input.profile;
  const restored = fillMissingContactDetails(input.profile, texts);
  if (restored.filled.length === 0) return input.profile;
  await prisma.product.update({
    where: { id: input.productId },
    data: { profileJson: restored.profile },
  });
  console.info(
    JSON.stringify({
      event: "profile_contact_details_restored",
      productId: input.productId,
      filled: restored.filled,
    }),
  );
  return restored.profile;
}

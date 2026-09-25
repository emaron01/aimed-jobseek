import type { CandidateProfile } from "@/lib/product-research/candidate-profile";
import { fillMissingRoleDates } from "@/lib/product-research/role-dates";
import { prisma } from "@/lib/prisma-client";

export async function persistExtractedExperienceDates(input: {
  organizationId: string;
  productId: string;
  profile: CandidateProfile;
}): Promise<CandidateProfile> {
  const missing = input.profile.experience.some(
    (role) => !role.startDate?.trim() || !role.endDate?.trim(),
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
  const restored = fillMissingRoleDates(input.profile, texts);
  if (restored.filled.length === 0) return input.profile;
  await prisma.product.update({
    where: { id: input.productId },
    data: { profileJson: restored.profile },
  });
  console.info(
    JSON.stringify({
      event: "profile_role_dates_restored",
      productId: input.productId,
      filledRoleIds: restored.filled.map((item) => item.roleId),
    }),
  );
  return restored.profile;
}

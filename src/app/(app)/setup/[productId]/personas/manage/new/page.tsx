import { redirect } from "next/navigation";
import { requireGatedPage } from "@/lib/product-config/feature-access";

type PageProps = {
  params: Promise<{ productId: string }>;
};

export default async function LegacyCustomPersonaPage({ params }: PageProps) {
  requireGatedPage("productLevelHiringTeam");
  const { productId } = await params;
  redirect(`/setup/${productId}/personas/new`);
}

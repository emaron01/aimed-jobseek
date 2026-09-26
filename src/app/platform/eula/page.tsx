import Link from "next/link";
import { requirePlatformSuperAdmin } from "@/lib/auth/authz";
import { ensureEulaSeeded } from "@/lib/legal/eula";
import { prisma } from "@/lib/prisma";
import { PlatformEulaConsole } from "@/components/platform/PlatformEulaConsole";
import { vocab } from "@/lib/product-config";

export default async function PlatformEulaPage() {
  const user = await requirePlatformSuperAdmin();
  await ensureEulaSeeded(user.id);

  const versions = await prisma.eulaVersion.findMany({
    orderBy: { versionNumber: "desc" },
    include: {
      _count: { select: { acceptances: true } },
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-subtle">
          <Link href="/platform" className="underline">
            Platform
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          End User License Agreement
        </h1>
        <p className="mt-1 text-sm text-muted">
          Manage published terms users must accept before using the {vocab.product.singular}.
          SUPER_ADMIN only.
        </p>
      </div>

      <PlatformEulaConsole
        versions={versions.map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          content: v.content,
          createdAt: v.createdAt.toISOString(),
          publishedAt: v.publishedAt?.toISOString() ?? null,
          acceptanceCount: v._count.acceptances,
        }))}
      />
    </div>
  );
}

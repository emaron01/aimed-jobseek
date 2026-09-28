import type { Prisma, PrismaClient } from "@prisma/client";
import {
  researchRefreshStaleReason,
  targetEmployerStaleReason,
} from "@/lib/application/fit";
import { prisma } from "@/lib/prisma-client";
import { isGatedSurfaceEnabled } from "@/lib/product-config/feature-access";

type FitDb = Prisma.TransactionClient | PrismaClient;

export async function markApplicationFitsStaleForCompany(
  db: FitDb,
  organizationId: string,
  companyId: string,
): Promise<void> {
  if (!isGatedSurfaceEnabled("employerIcpFit")) return;
  await db.applicationFit.updateMany({
    where: {
      organizationId,
      campaign: { jobRequirement: { is: { companyId } } },
    },
    data: {
      stale: true,
      staleReason: researchRefreshStaleReason(),
    },
  });
}

export async function markApplicationFitsStaleForIcp(
  organizationId: string,
  icpId: string,
  db: FitDb = prisma,
): Promise<void> {
  if (!isGatedSurfaceEnabled("employerIcpFit")) return;
  await db.applicationFit.updateMany({
    where: { organizationId, icpId },
    data: {
      stale: true,
      staleReason: targetEmployerStaleReason(),
    },
  });
}

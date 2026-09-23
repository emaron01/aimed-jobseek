import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { renderApplicationAssetDocx } from "@/lib/application-assets/docx";
import { applicationAssetContentSchema } from "@/lib/application-assets/contract";
import { prisma } from "@/lib/prisma";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";

function safeFilename(value: string): string {
  return value
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  try {
    const [{ assetId }, user, organizationId] = await Promise.all([
      context.params,
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const asset = await prisma.applicationAsset.findFirst({
      where: {
        id: assetId,
        organizationId,
        campaign: { ownerUserId: user.id },
      },
      include: { campaign: { select: { name: true } } },
    });
    if (!asset) {
      return NextResponse.json(
        { message: "Application asset was not found." },
        { status: 404 },
      );
    }
    const parsed = applicationAssetContentSchema.safeParse(asset.contentJson);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Application asset content is invalid." },
        { status: 422 },
      );
    }
    const bytes = await renderApplicationAssetDocx(parsed.data);
    const type = asset.type === "RESUME" ? "resume" : "cover-letter";
    const filename = safeFilename(
      `${asset.campaign.name}-${type}-v${asset.version}`,
    );
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename || type}.docx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "application_asset_docx_failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return NextResponse.json(
      { message: "The DOCX could not be created. Retry." },
      { status: 500 },
    );
  }
}

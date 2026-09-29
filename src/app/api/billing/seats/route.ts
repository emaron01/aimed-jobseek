import { NextResponse } from "next/server";
import { requireOrgOwner } from "@/lib/auth/authz";
import {
  addSeatToSubscription,
  previewSeatChange,
  removeSeatFromSubscription,
  type SeatChangeDirection,
} from "@/lib/billing/add-seat";
import { OrganizationReadOnlyError } from "@/lib/billing/account-read-only";
import {
  PaymentLockError,
  assertOrganizationNotPaymentLocked,
} from "@/lib/billing/payment-lock";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function usedSeatCount(organizationId: string): Promise<number> {
  return prisma.organizationMembership.count({
    where: { organizationId },
  });
}

/**
 * GET ?direction=add|remove — preview (add: proration today; remove: next-bill delta).
 * POST { direction, confirm: true } — apply seat change (OWNER).
 * Add uses create_prorations; remove uses proration_behavior none (no mid-cycle credit).
 */
export async function GET(request: Request) {
  try {
    const { organization } = await requireOrgOwner();
    await assertOrganizationNotPaymentLocked(organization.id);
    const url = new URL(request.url);
    const directionRaw = url.searchParams.get("direction") || "add";
    const direction: SeatChangeDirection =
      directionRaw === "remove" ? "remove" : "add";
    const usedSeats = await usedSeatCount(organization.id);
    const result = await previewSeatChange({
      organizationId: organization.id,
      direction,
      usedSeats,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: 400 },
      );
    }
    return NextResponse.json({ preview: result.preview });
  } catch (error) {
    if (
      error instanceof PaymentLockError ||
      error instanceof OrganizationReadOnlyError
    ) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Unable to preview seat change";
    const status =
      typeof error === "object" &&
      error &&
      "status" in error &&
      typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : 401;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const { organization } = await requireOrgOwner();
    await assertOrganizationNotPaymentLocked(organization.id);

    let direction: SeatChangeDirection = "add";
    let confirm = false;
    try {
      const body = (await request.json()) as {
        direction?: string;
        confirm?: boolean;
      };
      if (body.direction === "remove") direction = "remove";
      confirm = body.confirm === true;
    } catch {
      // Legacy: empty POST = add without confirm body (blocked — require confirm)
    }

    if (!confirm) {
      return NextResponse.json(
        {
          error: "Seat changes require confirmation.",
          code: "CONFIRM_REQUIRED",
        },
        { status: 400 },
      );
    }

    const usedSeats = await usedSeatCount(organization.id);
    const result =
      direction === "remove"
        ? await removeSeatFromSubscription({
            organizationId: organization.id,
            usedSeats,
          })
        : await addSeatToSubscription({
            organizationId: organization.id,
            usedSeats,
          });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: 400 },
      );
    }

    revalidatePath("/settings/organization");
    revalidatePath("/settings/billing");
    return NextResponse.json({ seatQuantity: result.seatQuantity });
  } catch (error) {
    if (
      error instanceof PaymentLockError ||
      error instanceof OrganizationReadOnlyError
    ) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Unable to change seats";
    const status =
      typeof error === "object" &&
      error &&
      "status" in error &&
      typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : 401;
    return NextResponse.json({ error: message }, { status });
  }
}

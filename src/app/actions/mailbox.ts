"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { disconnectMicrosoftMailbox } from "@/lib/mailbox/microsoft-oauth";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";
import { assertGatedAction } from "@/lib/product-config/feature-access";

export type MailboxConnectionActionResult = {
  ok: boolean;
  message: string;
};

export async function disconnectMicrosoftMailboxAction(
  _previous: MailboxConnectionActionResult | null,
  _formData: FormData,
): Promise<MailboxConnectionActionResult> {
  void _previous;
  void _formData;
  try {
    assertGatedAction("emailConnection");
    const [user, organization] = await Promise.all([
      requireCurrentUser(),
      requireOrganization(),
    ]);
    await disconnectMicrosoftMailbox({
      organizationId: organization.id,
      userId: user.id,
    });
    revalidatePath("/settings/email");
    return {
      ok: true,
      message: "Microsoft 365 mailbox disconnected.",
    };
  } catch (error) {
    console.error("Failed to disconnect Microsoft mailbox.", error);
    return {
      ok: false,
      message: "The mailbox could not be disconnected. Try again.",
    };
  }
}

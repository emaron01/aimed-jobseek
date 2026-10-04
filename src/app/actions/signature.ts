"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/authz";
import { TenantError } from "@/lib/tenant/errors";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import {
  upsertEmailSignatureForUser,
  type EmailSignatureView,
} from "@/lib/signature/signature";

export type SignatureActionResult = {
  ok: boolean;
  message: string;
  signature?: EmailSignatureView;
};

function toSafeSignatureError(error: unknown): string {
  if (error instanceof TenantError) return error.message;
  return "Unable to save your signature. Please try again.";
}

export async function saveEmailSignatureAction(
  _prev: SignatureActionResult | null,
  formData: FormData,
): Promise<SignatureActionResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const htmlField = formData.get("htmlBody");
    const signature = await upsertEmailSignatureForUser({
      organizationId,
      userId: user.id,
      body: String(formData.get("body") ?? ""),
      ...(htmlField == null ? {} : { htmlBody: String(htmlField) }),
    });
    revalidatePath("/settings/voice");
    revalidatePath("/settings/email");
    revalidatePath("/campaigns");
    return {
      ok: true,
      message: signature.active
        ? "Signature saved. Connected Send and Open in Outlook/Gmail will append it."
        : "Signature cleared. Sends will go out without a signature block.",
      signature,
    };
  } catch (error) {
    return { ok: false, message: toSafeSignatureError(error) };
  }
}

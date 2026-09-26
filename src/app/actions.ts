"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createCampaign,
  createIcp,
  createPersona,
  createProduct,
  deleteCampaign,
  deleteIcp,
  deletePersona,
  deleteProduct,
  updateIcp,
  updatePersona,
  updateProduct,
  getIcp,
} from "@/lib/tenant/data";
import { TenantError } from "@/lib/tenant/getCurrentOrganization";
import {
  parseCampaignFormData,
  toSafeCampaignActionError,
  type CampaignActionResult,
} from "@/lib/campaign/save";
import {
  parseIcpFormData,
  storedIcpHasProfile,
  submittedIcpProfileIsBlank,
  toSafeIcpActionError,
  type IcpActionResult,
} from "@/lib/icp/save";
import {
  parseProductFormData,
  toSafeProductActionError,
  type ProductActionResult,
} from "@/lib/product/save";
import {
  parsePersonaFormData,
  toSafePersonaActionError,
  type PersonaActionResult,
} from "@/lib/persona/save";
import {
  toSafeCrudDeleteError,
  type CrudDeleteResult,
} from "@/lib/tenant/crud-delete";
import {
  requireCurrentUser,
  requireSetupDeletePermission,
} from "@/lib/auth/authz";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { validateCampaignOffer } from "@/lib/campaign/offer-validation";
import { DELETE_SUCCESS_NOTICE_KEY } from "@/lib/tenant/delete-success-notice";
import { vocab } from "@/lib/product-config";
import { assertGatedAction } from "@/lib/product-config/feature-access";

function requiredString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function logActionError(fallback: string, error: unknown): void {
  if (error instanceof TenantError) {
    console.error(fallback, error.message);
    return;
  }
  console.error(fallback, error);
}

function revalidateSetup(productId?: string) {
  revalidatePath("/setup");
  if (productId) revalidatePath(`/setup/${productId}`);
  revalidatePath("/campaigns");
  revalidatePath("/");
}

/** Flash banner for DeleteSuccessNotice after server redirect(). */
async function flashDeleteSuccessNotice(message: string): Promise<void> {
  const jar = await cookies();
  jar.set(DELETE_SUCCESS_NOTICE_KEY, message, {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
  });
}

/** Allow only app-relative list destinations (optional campaign query). */
function safeListRedirectTo(raw: string): string {
  const value = raw.trim() || "/lists";
  if (!value.startsWith("/lists")) return "/lists";
  if (value.includes("://") || value.includes("//")) return "/lists";
  return value;
}

export async function upsertProductAction(
  _prev: ProductActionResult | null,
  formData: FormData,
): Promise<ProductActionResult> {
  const values = (() => {
    try {
      return parseProductFormData(formData).values;
    } catch {
      return undefined;
    }
  })();

  try {
    const parsed = parseProductFormData(formData);
    if (Object.keys(parsed.fieldErrors).length > 0) {
      const firstField = Object.keys(parsed.fieldErrors)[0] as
        | keyof typeof parsed.fieldErrors
        | undefined;
      const firstMessage = firstField
        ? parsed.fieldErrors[firstField]
        : undefined;
      return {
        ok: false,
        message: firstMessage ?? "Please fix the highlighted fields.",
        values: parsed.values,
        fieldErrors: parsed.fieldErrors,
      };
    }

    const { id, fields } = parsed;
    let productId = id;
    if (id) {
      await updateProduct(id, fields);
      revalidateSetup(id);
      return { ok: true, message: `${vocab.product.Singular} saved.`, productId: id };
    }

    const product = await createProduct(fields);
    productId = product.id;
    revalidateSetup(productId);
    return {
      ok: true,
      message: `${vocab.product.Singular} created.`,
      productId,
    };
  } catch (error) {
    logActionError("Failed to save product.", error);
    return {
      ok: false,
      message: toSafeProductActionError(error),
      values,
    };
  }
}

export async function deleteProductAction(
  _prev: CrudDeleteResult | null,
  formData: FormData,
): Promise<CrudDeleteResult> {
  let notice: string;
  try {
    await requireSetupDeletePermission();
    const id = requiredString(formData, "id");
    if (!id) throw new TenantError(`${vocab.product.Singular} id is required.`);
    const confirmed = requiredString(formData, "confirm") === "1";
    if (!confirmed) {
      return {
        ok: false,
        message: "Confirm deletion before continuing.",
      };
    }
    const result = await deleteProduct(id);
    // Do not revalidate `/setup/${id}` — that URL is leaving via redirect below.
    revalidatePath("/setup");
    revalidatePath("/products");
    revalidatePath("/campaigns");
    revalidatePath("/");
    notice = result.message;
  } catch (error) {
    logActionError("Failed to delete product.", error);
    return { ok: false, message: toSafeCrudDeleteError(error) };
  }

  // redirect() throws — keep outside try/catch so it is not swallowed.
  await flashDeleteSuccessNotice(notice);
  redirect("/products");
}

export async function upsertIcpAction(
  _prev: IcpActionResult | null,
  formData: FormData,
): Promise<IcpActionResult> {
  const values = (() => {
    try {
      return parseIcpFormData(formData).values;
    } catch {
      return undefined;
    }
  })();

  try {
    const parsed = parseIcpFormData(formData);
    if (Object.keys(parsed.fieldErrors).length > 0) {
      const firstField = Object.keys(parsed.fieldErrors)[0] as
        | keyof typeof parsed.fieldErrors
        | undefined;
      const firstMessage = firstField
        ? parsed.fieldErrors[firstField]
        : undefined;
      return {
        ok: false,
        message: firstMessage ?? "Please fix the highlighted fields.",
        productId: parsed.productId || undefined,
        values: parsed.values,
        fieldErrors: parsed.fieldErrors,
      };
    }

    const { id, productId, fields } = parsed;
    let icpId = id;
    if (id) {
      const existing = await getIcp(id);
      if (
        submittedIcpProfileIsBlank(fields) &&
        storedIcpHasProfile(existing)
      ) {
        return {
          ok: false,
          message:
            `Save aborted: the form was empty and would have erased this ${vocab.icp.singular}.`,
          productId,
          values: parsed.values,
        };
      }
      await updateIcp(id, fields);
    } else {
      const created = await createIcp({ ...fields, productId });
      icpId = created.id;
    }

    revalidateSetup(productId);
    return {
      ok: true,
      message: id ? `${vocab.icp.singular} saved.` : `${vocab.icp.singular} created.`,
      icpId,
      productId,
    };
  } catch (error) {
    logActionError("Failed to save ICP.", error);
    return {
      ok: false,
      message: toSafeIcpActionError(error),
      productId: values?.productId || undefined,
      values,
    };
  }
}

export async function deleteIcpAction(
  _prev: CrudDeleteResult | null,
  formData: FormData,
): Promise<CrudDeleteResult> {
  try {
    await requireSetupDeletePermission();
    const id = requiredString(formData, "id");
    const productId = requiredString(formData, "productId");
    if (!id) throw new TenantError(`${vocab.icp.singular} id is required.`);
    if (requiredString(formData, "confirm") !== "1") {
      return { ok: false, message: "Confirm deletion before continuing." };
    }
    const result = await deleteIcp(id);
    revalidateSetup(productId || undefined);
    return { ok: true, message: result.message, mode: result.mode };
  } catch (error) {
    logActionError("Failed to delete ICP.", error);
    return { ok: false, message: toSafeCrudDeleteError(error) };
  }
}

export async function upsertPersonaAction(
  _prev: PersonaActionResult | null,
  formData: FormData,
): Promise<PersonaActionResult> {
  try {
    assertGatedAction("productLevelHiringTeam");
    const { id, productId, fields } = parsePersonaFormData(formData);

    let personaId = id;
    if (id) {
      await updatePersona(id, fields);
    } else {
      const created = await createPersona({ ...fields, productId });
      personaId = created.id;
    }

    revalidateSetup(productId);
    return {
      ok: true,
      message: `${vocab.persona.Singular} saved.`,
      personaId,
    };
  } catch (error) {
    logActionError("Failed to save persona.", error);
    return { ok: false, message: toSafePersonaActionError(error) };
  }
}

export async function deletePersonaAction(
  _prev: CrudDeleteResult | null,
  formData: FormData,
): Promise<CrudDeleteResult> {
  try {
    assertGatedAction("productLevelHiringTeam");
    await requireSetupDeletePermission();
    const id = requiredString(formData, "id");
    const productId = requiredString(formData, "productId");
    if (!id) throw new TenantError(`${vocab.persona.Singular} id is required.`);
    if (requiredString(formData, "confirm") !== "1") {
      return { ok: false, message: "Confirm deletion before continuing." };
    }
    const result = await deletePersona(id);
    revalidateSetup(productId || undefined);
    return {
      ok: true,
      message: result.message,
      mode: result.mode,
      personaId: id,
      productId: productId || undefined,
    };
  } catch (error) {
    logActionError("Failed to delete persona.", error);
    return { ok: false, message: toSafeCrudDeleteError(error) };
  }
}

export async function deleteCampaignAction(
  _prev: CrudDeleteResult | null,
  formData: FormData,
): Promise<CrudDeleteResult> {
  let notice: string;
  try {
    const id = requiredString(formData, "id");
    if (!id) throw new TenantError(`${vocab.campaign.Singular} id is required.`);
    if (requiredString(formData, "confirm") !== "1") {
      return { ok: false, message: "Confirm deletion before continuing." };
    }
    const result = await deleteCampaign(id);
    // Revalidate list destinations only — never `/campaigns/${id}` (deleted).
    // Any revalidatePath would also re-render the current deleted URL; redirect
    // in the same response navigates away instead.
    revalidatePath("/campaigns");
    revalidateSetup();
    notice = result.message;
  } catch (error) {
    logActionError("Failed to delete campaign.", error);
    return { ok: false, message: toSafeCrudDeleteError(error) };
  }

  // redirect() throws — keep outside try/catch so it is not swallowed.
  await flashDeleteSuccessNotice(notice);
  redirect("/campaigns");
}

export async function archiveCampaignAction(
  _prev: CrudDeleteResult | null,
  formData: FormData,
): Promise<CrudDeleteResult> {
  try {
    const id = requiredString(formData, "id");
    if (!id) throw new TenantError(`${vocab.campaign.Singular} id is required.`);
    if (requiredString(formData, "confirm") !== "1") {
      return { ok: false, message: "Confirm archive before continuing." };
    }
    const { archiveCampaign } = await import("@/lib/tenant/campaign-archive");
    const result = await archiveCampaign(id);
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${id}`);
    revalidatePath("/");
    return { ok: true, message: result.message, mode: result.mode };
  } catch (error) {
    logActionError("Failed to archive campaign.", error);
    return { ok: false, message: toSafeCrudDeleteError(error) };
  }
}

export async function unarchiveCampaignAction(
  _prev: CrudDeleteResult | null,
  formData: FormData,
): Promise<CrudDeleteResult> {
  try {
    const id = requiredString(formData, "id");
    if (!id) throw new TenantError(`${vocab.campaign.Singular} id is required.`);
    const { unarchiveCampaign } = await import("@/lib/tenant/campaign-archive");
    const result = await unarchiveCampaign(id);
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${id}`);
    revalidatePath("/");
    return { ok: true, message: result.message, mode: result.mode };
  } catch (error) {
    logActionError("Failed to unarchive campaign.", error);
    return { ok: false, message: toSafeCrudDeleteError(error) };
  }
}

export async function archiveContactListAction(
  _prev: CrudDeleteResult | null,
  formData: FormData,
): Promise<CrudDeleteResult> {
  try {
    assertGatedAction("lists");
    const id = requiredString(formData, "id");
    if (!id) throw new TenantError(`${vocab.list.Singular} id is required.`);
    if (requiredString(formData, "confirm") !== "1") {
      return { ok: false, message: "Confirm archive before continuing." };
    }
    const { archiveContactList } = await import("@/lib/tenant/list-delete");
    const result = await archiveContactList(id);
    revalidatePath("/lists");
    revalidatePath(`/lists/${id}`);
    revalidatePath("/contacts");
    revalidatePath("/campaigns");
    revalidatePath("/");
    return { ok: true, message: result.message, mode: result.mode };
  } catch (error) {
    logActionError("Failed to archive list.", error);
    return { ok: false, message: toSafeCrudDeleteError(error) };
  }
}

export async function unarchiveContactListAction(
  _prev: CrudDeleteResult | null,
  formData: FormData,
): Promise<CrudDeleteResult> {
  try {
    assertGatedAction("lists");
    const id = requiredString(formData, "id");
    if (!id) throw new TenantError(`${vocab.list.Singular} id is required.`);
    const { unarchiveContactList } = await import("@/lib/tenant/list-delete");
    const result = await unarchiveContactList(id);
    revalidatePath("/lists");
    revalidatePath(`/lists/${id}`);
    revalidatePath("/contacts");
    revalidatePath("/campaigns");
    revalidatePath("/");
    return { ok: true, message: result.message, mode: result.mode };
  } catch (error) {
    logActionError("Failed to unarchive list.", error);
    return { ok: false, message: toSafeCrudDeleteError(error) };
  }
}

export async function deleteContactListAction(
  _prev: CrudDeleteResult | null,
  formData: FormData,
): Promise<CrudDeleteResult> {
  let notice: string;
  let destination: string;
  try {
    assertGatedAction("lists");
    const id = requiredString(formData, "id");
    if (!id) throw new TenantError(`${vocab.list.Singular} id is required.`);
    if (requiredString(formData, "confirm") !== "1") {
      return { ok: false, message: "Confirm deletion before continuing." };
    }
    const { deleteOrArchiveContactList } = await import(
      "@/lib/tenant/list-delete"
    );
    const result = await deleteOrArchiveContactList(id);
    // Never revalidate `/lists/${id}` — redirect away in the same response.
    revalidatePath("/lists");
    revalidatePath("/contacts");
    revalidatePath("/campaigns");
    revalidatePath("/");
    notice = result.message;
    destination = safeListRedirectTo(requiredString(formData, "redirectTo"));
  } catch (error) {
    logActionError("Failed to delete list.", error);
    return { ok: false, message: toSafeCrudDeleteError(error) };
  }

  // redirect() throws — keep outside try/catch so it is not swallowed.
  await flashDeleteSuccessNotice(notice);
  redirect(destination);
}

export async function createCampaignAction(
  _prev: CampaignActionResult | null,
  formData: FormData,
): Promise<CampaignActionResult> {
  const values = (() => {
    try {
      return parseCampaignFormData(formData).values;
    } catch {
      return undefined;
    }
  })();

  try {
    const parsed = parseCampaignFormData(formData);
    if (Object.keys(parsed.fieldErrors).length > 0) {
      const firstField = Object.keys(parsed.fieldErrors)[0] as
        | keyof typeof parsed.fieldErrors
        | undefined;
      const firstMessage = firstField
        ? parsed.fieldErrors[firstField]
        : undefined;
      return {
        ok: false,
        message: firstMessage ?? "Please fix the highlighted fields.",
        values: parsed.values,
        fieldErrors: parsed.fieldErrors,
      };
    }

    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const offerValidation = await validateCampaignOffer({
      organizationId,
      userId: user.id,
      productId: parsed.fields.productId,
      personaId: parsed.fields.personaId,
      offer: {
        offerName: parsed.fields.offerName,
        offerDescription: parsed.fields.offerDescription,
        offerCta: parsed.fields.offerCta,
        offerNotes: parsed.fields.offerNotes,
      },
    });
    const { interpretJobPosting } = await import("@/lib/job-requirement/parse");
    const parsedJob = await interpretJobPosting(parsed.fields.postingText, {
      organizationId,
      userId: user.id,
      category: "INTERPRETATION",
      operation: "JOB_REQUIREMENT_PARSE",
    });
    const campaign = await createCampaign({
      ...parsed.fields,
      contactIds: parsed.contactIds,
      offerValidationJson: {
        conflicts: offerValidation.conflicts,
        semanticValidationCompleted:
          offerValidation.semanticValidationCompleted,
      },
      offerValidationHash: offerValidation.hash,
    });
    try {
      const { attachParsedPosting } = await import("@/lib/application/service");
      await attachParsedPosting({
        organizationId,
        campaignId: campaign.id,
        rawText: parsed.fields.postingText,
        postingUrl: parsed.fields.postingUrl,
        parsed: parsedJob,
        icpId: parsed.fields.icpId,
      });
    } catch (attachError) {
      const { prisma } = await import("@/lib/prisma");
      await prisma.campaign.delete({ where: { id: campaign.id } }).catch((deleteError) => {
        console.error(
          JSON.stringify({
            event: "application_create_rollback_failed",
            message:
              deleteError instanceof Error ? deleteError.message : "unknown",
          }),
        );
      });
      throw attachError;
    }
    revalidatePath("/campaigns");
    revalidatePath("/");
    return {
      ok: true,
      message: `${vocab.campaign.Singular} created.`,
      campaignId: campaign.id,
    };
  } catch (error) {
    logActionError("Failed to create campaign.", error);
    return {
      ok: false,
      message: toSafeCampaignActionError(error),
      values,
    };
  }
}

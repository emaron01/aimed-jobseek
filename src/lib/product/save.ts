/**
 * Product form parsing and safe action results (Node-safe, no server-only).
 */

import { toOptionalFloat } from "@/lib/utils";
import { TenantError } from "@/lib/tenant/errors";
import { vocab } from "@/lib/product-config";

export type ProductActionResult = {
  ok: boolean;
  message: string;
  productId?: string;
  /** Echo submitted values so the form can restore them after a failed save. */
  values?: ProductFormValues;
  fieldErrors?: Partial<Record<keyof ProductFormValues, string>>;
};

export type ProductFormValues = {
  id: string;
  name: string;
  description: string;
  valueProposition: string;
  averageOrderValue: string;
  websiteUrl: string;
};

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export function readProductFormValues(formData: FormData): ProductFormValues {
  return {
    id: readString(formData, "id"),
    name: readString(formData, "name"),
    description: readString(formData, "description"),
    valueProposition: readString(formData, "valueProposition"),
    averageOrderValue: readString(formData, "averageOrderValue"),
    websiteUrl: readString(formData, "websiteUrl"),
  };
}

export function parseProductFormData(formData: FormData): {
  id: string;
  values: ProductFormValues;
  fields: {
    name: string;
    description: string | null;
    valueProposition: string | null;
    averageOrderValue: number | null;
    websiteUrl: string | null;
  };
  fieldErrors: Partial<Record<keyof ProductFormValues, string>>;
} {
  const values = readProductFormValues(formData);
  const fieldErrors: Partial<Record<keyof ProductFormValues, string>> = {};

  if (!values.name) {
    fieldErrors.name = `${vocab.product.Singular} name is required.`;
  }

  const aovRaw = formData.get("averageOrderValue");
  const averageOrderValue = toOptionalFloat(aovRaw);
  if (values.averageOrderValue && averageOrderValue == null) {
    fieldErrors.averageOrderValue = "Typical price / AOV must be a number.";
  }

  return {
    id: values.id,
    values,
    fieldErrors,
    fields: {
      name: values.name,
      description: values.description || null,
      valueProposition: values.valueProposition || null,
      averageOrderValue,
      websiteUrl: values.websiteUrl || null,
    },
  };
}

/** Safe, user-facing error — never Prisma / stack / tenant ids. */
export function toSafeProductActionError(error: unknown): string {
  if (error instanceof TenantError) return error.message;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return "A product with this name may already exist.";
    }
    if (msg.includes("foreign key") || msg.includes("restrict")) {
      return "This product could not be saved because of a relationship conflict.";
    }
  }
  return "Unable to save product. Please try again.";
}

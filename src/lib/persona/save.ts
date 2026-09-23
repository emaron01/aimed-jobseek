/**
 * Persona form parsing and safe action results (Node-safe, no server-only).
 */

import { parseCommaList } from "@/lib/utils";
import { TenantError } from "@/lib/tenant/errors";
import { vocab } from "@/lib/product-config";

export type PersonaActionResult = {
  ok: boolean;
  message: string;
  personaId?: string;
};

export type PersonaAuthoritativeFields = {
  name: string;
  definition: string | null;
  additionalContext: string | null;
  targetTitles: string[];
  department: string | null;
  seniority: string | null;
  responsibilities: string | null;
  painPoints: string | null;
  /** Business/operational outcomes the buyer wants from a solution like ours — not campaign CTAs. */
  desiredOutcomes: string | null;
  messagingNotes: string | null;
};

function requiredString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export function parsePersonaFormData(formData: FormData): {
  id: string;
  productId: string;
  fields: PersonaAuthoritativeFields;
} {
  const id = requiredString(formData, "id");
  const productId = requiredString(formData, "productId");
  const name = requiredString(formData, "name");
  if (!productId) throw new TenantError(`${vocab.product.Singular} is required.`);
  if (!name) throw new TenantError(`${vocab.persona.Singular} name is required.`);

  return {
    id,
    productId,
    fields: {
      name,
      definition: requiredString(formData, "definition") || null,
      additionalContext: requiredString(formData, "additionalContext") || null,
      targetTitles: parseCommaList(requiredString(formData, "targetTitles")),
      department: requiredString(formData, "department") || null,
      seniority: requiredString(formData, "seniority") || null,
      responsibilities: requiredString(formData, "responsibilities") || null,
      painPoints: requiredString(formData, "painPoints") || null,
      desiredOutcomes: requiredString(formData, "desiredOutcomes") || null,
      messagingNotes: requiredString(formData, "messagingNotes") || null,
    },
  };
}

/** Safe, user-facing error — never Prisma / stack / tenant ids. */
export function toSafePersonaActionError(error: unknown): string {
  if (error instanceof TenantError) return error.message;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return "A persona with this name may already exist for this product.";
    }
    if (msg.includes("foreign key") || msg.includes("restrict")) {
      return "This persona could not be saved because of a product relationship conflict.";
    }
  }
  return "Unable to save persona. Please try again.";
}

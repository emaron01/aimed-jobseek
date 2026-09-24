"use server";

import { revalidatePath } from "next/cache";
import {
  findDuplicateRows,
  type DuplicateMode,
  type ImportSourceType,
  type PreparedContact,
} from "@/lib/import";
import {
  findExistingContactsForDuplicateCheck,
  importContactList,
} from "@/lib/tenant/data";
import { TenantError } from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";
import { assertGatedAction } from "@/lib/product-config/feature-access";

export type DuplicateCheckResult = {
  ok: boolean;
  error?: string;
  potentialDuplicates: number;
  duplicateIndexes: number[];
};

export type ImportActionResult = {
  ok: boolean;
  error?: string;
  listId?: string;
  importedCount?: number;
  suppressedCount?: number;
  emailMissingCount?: number;
  mergedCount?: number;
  titleChangedCount?: number;
};

function sanitizeContacts(contacts: PreparedContact[]): PreparedContact[] {
  return contacts.map((contact) => ({
    firstName: contact.firstName?.trim() || null,
    lastName: contact.lastName?.trim() || null,
    email: contact.email?.trim().toLowerCase() || null,
    title: contact.title?.trim() || null,
    company: contact.company?.trim() || null,
    companyWebsite: contact.companyWebsite?.trim() || null,
    industry: contact.industry?.trim() || null,
    employeeCount:
      typeof contact.employeeCount === "number" &&
      Number.isFinite(contact.employeeCount)
        ? contact.employeeCount
        : null,
    revenue:
      typeof contact.revenue === "number" && Number.isFinite(contact.revenue)
        ? contact.revenue
        : null,
    location: contact.location?.trim() || null,
    linkedinUrl: contact.linkedinUrl?.trim() || null,
    phone: contact.phone?.trim() || null,
    rawData:
      contact.rawData && typeof contact.rawData === "object"
        ? Object.fromEntries(
            Object.entries(contact.rawData).map(([key, value]) => [
              String(key),
              String(value ?? ""),
            ]),
          )
        : {},
  }));
}

export async function checkImportDuplicatesAction(
  contacts: PreparedContact[],
): Promise<DuplicateCheckResult> {
  try {
    assertGatedAction("listImport");
    const sanitized = sanitizeContacts(contacts);
    const existing = await findExistingContactsForDuplicateCheck();
    const duplicateIndexes = findDuplicateRows(sanitized, existing);
    return {
      ok: true,
      potentialDuplicates: duplicateIndexes.length,
      duplicateIndexes,
    };
  } catch (error) {
    if (error instanceof TenantError) {
      return {
        ok: false,
        error: error.message,
        potentialDuplicates: 0,
        duplicateIndexes: [],
      };
    }
    console.error("checkImportDuplicatesAction", error);
    return {
      ok: false,
      error: "Unable to check duplicates.",
      potentialDuplicates: 0,
      duplicateIndexes: [],
    };
  }
}

export async function importContactsAction(input: {
  name: string;
  sourceType: ImportSourceType;
  originalFilename?: string | null;
  contacts: PreparedContact[];
  duplicateMode: DuplicateMode;
}): Promise<ImportActionResult> {
  try {
    assertGatedAction("listImport");
    const name = input.name.trim();
    if (!name) {
      return { ok: false, error: `${vocab.list.Singular} name is required.` };
    }

    let contacts = sanitizeContacts(input.contacts);
    if (contacts.length === 0) {
      return { ok: false, error: `No ${vocab.contact.plural} to import.` };
    }

    if (input.duplicateMode === "skip") {
      const existing = await findExistingContactsForDuplicateCheck();
      const duplicateIndexes = new Set(findDuplicateRows(contacts, existing));
      contacts = contacts.filter((_, index) => !duplicateIndexes.has(index));
    }

    if (contacts.length === 0) {
      return {
        ok: false,
        error: `All ${vocab.contact.plural} were skipped as duplicates. Nothing to import.`,
      };
    }

    const result = await importContactList({
      name,
      sourceType: input.sourceType,
      originalFilename: input.originalFilename ?? null,
      contacts,
    });

    revalidatePath("/lists");
    revalidatePath(`/lists/${result.listId}`);
    revalidatePath("/contacts");
    revalidatePath("/");

    return {
      ok: true,
      listId: result.listId,
      importedCount: result.importedCount,
      suppressedCount: result.suppressedCount,
      emailMissingCount: result.emailMissingCount,
      mergedCount: result.mergedCount,
      titleChangedCount: result.titleChangedCount,
    };
  } catch (error) {
    if (error instanceof TenantError) {
      return { ok: false, error: error.message };
    }
    console.error("importContactsAction", error);
    return { ok: false, error: "Import failed. Please try again." };
  }
}

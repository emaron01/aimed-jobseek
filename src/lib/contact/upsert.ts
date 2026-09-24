/**
 * Upsert a Contact into a list: org-unique on normalizedEmail when present;
 * email-less contacts are always created as new rows (cannot dedupe safely).
 *
 * Merge policy: incoming non-null wins. Title exception: when incoming title
 * differs from stored title, previousTitle + titleChangedAt are recorded.
 */
import type { Contact, Prisma } from "@prisma/client";
import { normalizeContactEmail } from "@/lib/contact/identity";

type Db = Prisma.TransactionClient;

export type ContactUpsertInput = {
  organizationId: string;
  ownerUserId: string;
  createdByUserId?: string | null;
  addedByUserId?: string | null;
  contactListId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  company: string | null;
  companyWebsite: string | null;
  industry: string | null;
  employeeCount: number | null;
  revenue: number | null;
  location: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  rawData: Prisma.InputJsonValue;
};

export type ContactUpsertResult = {
  contact: Contact;
  created: boolean;
  merged: boolean;
  emailMissing: boolean;
  titleChanged: boolean;
};

function incomingNonNullWins(
  existing: Contact,
  input: ContactUpsertInput,
): { data: Prisma.ContactUpdateInput; titleChanged: boolean } {
  const data: Prisma.ContactUpdateInput = {};
  const take = <K extends keyof ContactUpsertInput>(
    field: K,
    column: keyof Prisma.ContactUpdateInput = field as keyof Prisma.ContactUpdateInput,
  ) => {
    const incoming = input[field];
    if (incoming == null || incoming === "") return;
    (data as Record<string, unknown>)[column as string] = incoming;
  };

  take("firstName");
  take("lastName");
  take("company");
  take("companyWebsite");
  take("industry");
  take("employeeCount");
  take("revenue");
  take("location");
  take("linkedinUrl");
  take("phone");
  take("rawData");

  let titleChanged = false;
  if (input.title != null && input.title !== "") {
    if (
      existing.title != null &&
      existing.title !== "" &&
      existing.title !== input.title
    ) {
      data.previousTitle = existing.title;
      data.titleChangedAt = new Date();
      data.title = input.title;
      titleChanged = true;
    } else if (existing.title !== input.title) {
      data.title = input.title;
    }
  }

  if (input.email != null && input.email !== "") {
    data.email = input.email;
  }

  return { data, titleChanged };
}

export async function upsertContactIntoList(
  db: Db,
  input: ContactUpsertInput,
): Promise<ContactUpsertResult> {
  const normalizedEmail = normalizeContactEmail(input.email);

  if (!normalizedEmail) {
    const contact = await db.contact.create({
      data: {
        organizationId: input.organizationId,
        ownerUserId: input.ownerUserId,
        createdByUserId: input.createdByUserId ?? null,
        normalizedEmail: null,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        title: input.title,
        company: input.company,
        companyWebsite: input.companyWebsite,
        industry: input.industry,
        employeeCount: input.employeeCount,
        revenue: input.revenue,
        location: input.location,
        linkedinUrl: input.linkedinUrl,
        phone: input.phone,
        rawData: input.rawData,
        memberships: {
          create: {
            organizationId: input.organizationId,
            contactListId: input.contactListId,
            addedByUserId: input.addedByUserId ?? null,
          },
        },
      },
    });
    return {
      contact,
      created: true,
      merged: false,
      emailMissing: true,
      titleChanged: false,
    };
  }

  const existing = await db.contact.findFirst({
    where: {
      organizationId: input.organizationId,
      ownerUserId: input.ownerUserId,
      normalizedEmail,
    },
  });

  if (!existing) {
    const contact = await db.contact.create({
      data: {
        organizationId: input.organizationId,
        ownerUserId: input.ownerUserId,
        createdByUserId: input.createdByUserId ?? null,
        normalizedEmail,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        title: input.title,
        company: input.company,
        companyWebsite: input.companyWebsite,
        industry: input.industry,
        employeeCount: input.employeeCount,
        revenue: input.revenue,
        location: input.location,
        linkedinUrl: input.linkedinUrl,
        phone: input.phone,
        rawData: input.rawData,
        memberships: {
          create: {
            organizationId: input.organizationId,
            contactListId: input.contactListId,
            addedByUserId: input.addedByUserId ?? null,
          },
        },
      },
    });
    return {
      contact,
      created: true,
      merged: false,
      emailMissing: false,
      titleChanged: false,
    };
  }

  const { data, titleChanged } = incomingNonNullWins(existing, input);
  if (existing.archivedAt) {
    data.archivedAt = null;
    data.archiveReason = null;
    data.archivedByList = { disconnect: true };
  }
  const contact =
    Object.keys(data).length > 0
      ? await db.contact.update({ where: { id: existing.id }, data })
      : existing;

  await db.contactListMembership.upsert({
    where: {
      contactListId_contactId: {
        contactListId: input.contactListId,
        contactId: contact.id,
      },
    },
    create: {
      organizationId: input.organizationId,
      contactListId: input.contactListId,
      contactId: contact.id,
      addedByUserId: input.addedByUserId ?? null,
    },
    update: {},
  });

  return {
    contact,
    created: false,
    merged: true,
    emailMissing: false,
    titleChanged,
  };
}

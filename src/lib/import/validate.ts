import type {
  ColumnMapping,
  ContactFieldKey,
  PreparedContact,
  ValidatedRow,
} from "@/lib/import/types";
import { vocab } from "@/lib/product-config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_RE.test(email);
}

export function parseEmployeeCount(value: string): {
  value: number | null;
  warning?: string;
} {
  const raw = value.trim();
  if (!raw) return { value: null };

  const cleaned = raw.replace(/,/g, "").replace(/\+/g, "");
  const range = cleaned.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (range) {
    const mid = Math.round((Number(range[1]) + Number(range[2])) / 2);
    return { value: mid, warning: `Interpreted employee range "${raw}" as ${mid}.` };
  }

  const withSuffix = cleaned.match(/^(\d+(?:\.\d+)?)\s*([kKmMbB])$/);
  if (withSuffix) {
    const amount = Number(withSuffix[1]);
    const suffix = withSuffix[2].toLowerCase();
    const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : 1_000_000_000;
    return { value: Math.round(amount * multiplier) };
  }

  const numeric = Number(cleaned.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) {
    return { value: null, warning: `Could not parse employee count "${raw}".` };
  }

  return { value: Math.round(numeric) };
}

export function parseRevenue(value: string): {
  value: number | null;
  warning?: string;
} {
  const raw = value.trim();
  if (!raw) return { value: null };

  const cleaned = raw.replace(/[$,\s]/g, "");
  const withSuffix = cleaned.match(/^(\d+(?:\.\d+)?)\s*([kKmMbB])$/);
  if (withSuffix) {
    const amount = Number(withSuffix[1]);
    const suffix = withSuffix[2].toLowerCase();
    const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : 1_000_000_000;
    return { value: amount * multiplier };
  }

  const numeric = Number(cleaned.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) {
    return { value: null, warning: `Could not parse revenue "${raw}".` };
  }

  return { value: numeric };
}

function emptyContact(rawData: Record<string, string>): PreparedContact {
  return {
    firstName: null,
    lastName: null,
    email: null,
    title: null,
    company: null,
    companyWebsite: null,
    industry: null,
    employeeCount: null,
    revenue: null,
    location: null,
    linkedinUrl: null,
    phone: null,
    rawData,
  };
}

export function mapRowToContact(
  headers: string[],
  cells: string[],
  mapping: ColumnMapping,
): PreparedContact {
  const rawData: Record<string, string> = {};
  for (let i = 0; i < headers.length; i += 1) {
    rawData[headers[i]] = String(cells[i] ?? "").trim();
  }

  const contact = emptyContact(rawData);
  const assigned = new Set<ContactFieldKey>();

  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i];
    const destination = mapping[header] ?? "ignore";
    const value = String(cells[i] ?? "").trim();

    if (destination === "ignore") continue;
    if (assigned.has(destination)) continue;
    assigned.add(destination);

    if (destination === "email") {
      contact.email = normalizeEmail(value);
      continue;
    }
    if (destination === "employeeCount") {
      contact.employeeCount = parseEmployeeCount(value).value;
      continue;
    }
    if (destination === "revenue") {
      contact.revenue = parseRevenue(value).value;
      continue;
    }

    contact[destination] = value || null;
  }

  return contact;
}

export function validateMappedRows(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping,
): ValidatedRow[] {
  const results: ValidatedRow[] = [];

  rows.forEach((cells, index) => {
    const rowNumber = index + 2; // header is row 1
    const rawData: Record<string, string> = {};
    for (let i = 0; i < headers.length; i += 1) {
      rawData[headers[i]] = String(cells[i] ?? "").trim();
    }

    const isBlank = Object.values(rawData).every((value) => !value);
    if (isBlank) return;

    const issues: ValidatedRow["issues"] = [];
    const contact = emptyContact(rawData);
    const assigned = new Set<ContactFieldKey>();

    for (let i = 0; i < headers.length; i += 1) {
      const header = headers[i];
      const destination = mapping[header] ?? "ignore";
      const value = String(cells[i] ?? "").trim();
      if (destination === "ignore") continue;
      if (assigned.has(destination)) continue;
      assigned.add(destination);

      if (destination === "email") {
        const email = normalizeEmail(value);
        contact.email = email;
        if (value && !email) {
          issues.push({
            rowNumber,
            level: "error",
            message: "Email could not be normalized.",
          });
        } else if (email && !isValidEmailFormat(email)) {
          issues.push({
            rowNumber,
            level: "error",
            message: `Invalid email format: ${email}`,
          });
        }
        continue;
      }

      if (destination === "employeeCount") {
        const parsed = parseEmployeeCount(value);
        contact.employeeCount = parsed.value;
        if (parsed.warning) {
          issues.push({
            rowNumber,
            level: "warning",
            message: parsed.warning,
          });
        }
        continue;
      }

      if (destination === "revenue") {
        const parsed = parseRevenue(value);
        contact.revenue = parsed.value;
        if (parsed.warning) {
          issues.push({
            rowNumber,
            level: "warning",
            message: parsed.warning,
          });
        }
        continue;
      }

      contact[destination] = value || null;
    }

    if (!contact.email) {
      issues.push({
        rowNumber,
        level: "warning",
        message: "Email is missing.",
      });
    }

    const hasAnyIdentity =
      Boolean(contact.email) ||
      Boolean(contact.firstName) ||
      Boolean(contact.lastName) ||
      Boolean(contact.company) ||
      Boolean(contact.title);

    if (!hasAnyIdentity) {
      issues.push({
        rowNumber,
        level: "error",
        message: `Row has no identifiable ${vocab.contact.singular} fields.`,
      });
    }

    const hasError = issues.some((issue) => issue.level === "error");
    const hasWarning = issues.some((issue) => issue.level === "warning");

    results.push({
      rowNumber,
      contact,
      issues,
      status: hasError ? "invalid" : hasWarning ? "warning" : "valid",
    });
  });

  return results;
}

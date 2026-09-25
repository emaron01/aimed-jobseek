/**
 * Named fields from application workspace forms.
 * Accepts aliases so a renamed input still reaches the action.
 */

export function readTrimmedField(
  formData: FormData,
  ...names: string[]
): string {
  for (const name of names) {
    const value = String(formData.get(name) ?? "").trim();
    if (value) return value;
  }
  return "";
}

export function readEmployerCorrectionFields(formData: FormData): {
  campaignId: string;
  employerName: string;
  website: string;
  companyId: string;
} {
  return {
    campaignId: readTrimmedField(formData, "campaignId"),
    employerName: readTrimmedField(
      formData,
      "employerName",
      "companyName",
      "correctCompanyName",
    ),
    website: readTrimmedField(
      formData,
      "website",
      "companyWebsite",
      "employerWebsite",
    ),
    companyId: readTrimmedField(formData, "companyId"),
  };
}

export function applyFallbackFields(
  formData: FormData,
  fallbacks: Record<string, string>,
): FormData {
  for (const [key, value] of Object.entries(fallbacks)) {
    if (!String(formData.get(key) ?? "").trim() && value.trim()) {
      formData.set(key, value);
    }
  }
  return formData;
}

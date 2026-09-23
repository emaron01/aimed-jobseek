import { applicationAssetConfig } from "@/lib/product-config";

const YEAR = /^(\d{4})$/;
const YEAR_MONTH = /^(\d{4})-(\d{1,2})$/;
const YEAR_MONTH_DAY = /^(\d{4})-(\d{1,2})-\d{1,2}$/;

function formatStoredDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const yearOnly = trimmed.match(YEAR);
  if (yearOnly) return yearOnly[1]!;
  const withMonth = trimmed.match(YEAR_MONTH) ?? trimmed.match(YEAR_MONTH_DAY);
  if (!withMonth) return trimmed;
  const monthIndex = Number(withMonth[2]);
  const monthName = applicationAssetConfig.dateDisplay.monthNames[monthIndex - 1];
  if (!monthName) return withMonth[1]!;
  return `${monthName} ${withMonth[1]}`;
}

export function formatResumeDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): string {
  const start = startDate?.trim() ? formatStoredDate(startDate) : "";
  const end = endDate?.trim() ? formatStoredDate(endDate) : "";
  const { rangeSeparator, currentRoleLabel } = applicationAssetConfig.dateDisplay;
  if (start && end) return `${start} ${rangeSeparator} ${end}`;
  if (start) return `${start} ${rangeSeparator} ${currentRoleLabel}`;
  return end;
}

export function formatResumeRoleMeta(role: {
  startDate: string | null;
  endDate: string | null;
  location: string | null;
}): string {
  return [formatResumeDateRange(role.startDate, role.endDate), role.location]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" | ");
}

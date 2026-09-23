/**
 * Compensation comparison settings. Currency and the annual-hours figure
 * used for cross-unit estimates live here, not in environment variables.
 */
import { compensationCopy } from "./vocabulary";

export const compensationConfig = Object.freeze({
  defaultCurrency: "USD",
  /** Hours in the year used only when converting hourly and annual pay. */
  annualHoursForEstimate: 2080,
});

export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME"] as const;

export type EmploymentTypeCode = (typeof EMPLOYMENT_TYPES)[number];

export function isEmploymentTypeCode(value: string): value is EmploymentTypeCode {
  return (EMPLOYMENT_TYPES as readonly string[]).includes(value);
}

export function employmentTypeLabel(code: EmploymentTypeCode): string {
  switch (code) {
    case "FULL_TIME":
      return compensationCopy.fullTime;
    case "PART_TIME":
      return compensationCopy.partTime;
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

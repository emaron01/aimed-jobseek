/**
 * ICP form parsing and safe action results (Node-safe, no server-only).
 */

import { parseCommaList } from "@/lib/utils";
import { TenantError } from "@/lib/tenant/errors";
import {
  compensationConfig,
  criterionFlags,
  isEmploymentTypeCode,
  vocab,
} from "@/lib/product-config";
import { parseEmploymentTypeCodes } from "@/lib/application/compensation-fit";

export type IcpActionResult = {
  ok: boolean;
  message: string;
  icpId?: string;
  productId?: string;
  /** Echo submitted values so the form can restore them after a failed save. */
  values?: IcpFormValues;
  fieldErrors?: Partial<Record<keyof IcpFormValues, string>>;
  /** Present only for an unsaved starter draft. Never written until approve. */
  starterDraft?: StarterTargetEmployerDraft;
};

export const STARTER_DRAFT_KIND = criterionFlags.inference;

export type StarterCriterionRow = {
  name: string;
  description?: string | null;
  criterionType: string;
  dataType: string;
  operator: string;
  targetValue?: unknown;
  minValue?: unknown;
  maxValue?: unknown;
  allowedValues?: unknown;
  importance: string;
  isRequired: boolean;
  isDisqualifier: boolean;
  researchGuidance?: string | null;
  strengthAdjustment?: string | null;
  evidenceClass?: string | null;
  tier?: string | null;
  isMandatory?: boolean;
  sortOrder: number;
};

export type StarterTargetEmployerDraft = {
  kind: typeof STARTER_DRAFT_KIND;
  name: string;
  definition: string;
  additionalContext: string;
  criteria: StarterCriterionRow[];
  interpretationSummary: string | null;
  interpretationUndetermined: string | null;
  compensation: StatedCompensationFormFields;
};

type StatedCompensationFormFields = {
  targetAnnualEarningsMin: string;
  targetAnnualEarningsTarget: string;
  targetHourlyRateMin: string;
  targetHourlyRateTarget: string;
  compensationCurrency: string;
  employmentTypes: string;
  annualEarningsMinimumRequired: string;
  hourlyRateMinimumRequired: string;
  employmentTypeRequired: string;
};

export type IcpFormValues = {
  id: string;
  productId: string;
  name: string;
  description: string;
  definition: string;
  additionalContext: string;
  targetIndustries: string;
  minEmployees: string;
  maxEmployees: string;
  minRevenue: string;
  maxRevenue: string;
  targetGeographies: string;
  requiredTechnologies: string;
  positiveSignals: string;
  negativeSignals: string;
  notes: string;
  targetAnnualEarningsMin: string;
  targetAnnualEarningsTarget: string;
  targetHourlyRateMin: string;
  targetHourlyRateTarget: string;
  compensationCurrency: string;
  employmentTypes: string;
  annualEarningsMinimumRequired: string;
  hourlyRateMinimumRequired: string;
  employmentTypeRequired: string;
};

/**
 * Plain ICP record safe to pass from a Server Component into the edit form.
 * Prisma Decimal / Date / class instances are not serializable as client props —
 * passing the raw Icp model leaves every input empty on the client.
 */
export type IcpClientRecord = {
  id: string;
  name: string;
  description: string | null;
  definition: string | null;
  additionalContext: string | null;
  targetIndustries: unknown;
  minEmployees: number | null;
  maxEmployees: number | null;
  minRevenue: string | null;
  maxRevenue: string | null;
  targetGeographies: unknown;
  requiredTechnologies: unknown;
  positiveSignals: unknown;
  negativeSignals: unknown;
  notes: string | null;
  interpretationSummary: string | null;
  interpretationUndetermined: string | null;
  targetAnnualEarningsMin: string | null;
  targetAnnualEarningsTarget: string | null;
  targetHourlyRateMin: string | null;
  targetHourlyRateTarget: string | null;
  compensationCurrency: string | null;
  employmentTypes: string[];
  annualEarningsMinimumRequired: boolean;
  hourlyRateMinimumRequired: boolean;
  employmentTypeRequired: boolean;
};

export type IcpRecordSource = {
  id: string;
  name: string;
  description?: string | null;
  definition?: string | null;
  additionalContext?: string | null;
  targetIndustries?: unknown;
  minEmployees?: number | null;
  maxEmployees?: number | null;
  minRevenue?: unknown;
  maxRevenue?: unknown;
  targetGeographies?: unknown;
  requiredTechnologies?: unknown;
  positiveSignals?: unknown;
  negativeSignals?: unknown;
  notes?: string | null;
  interpretationSummary?: string | null;
  interpretationUndetermined?: string | null;
  targetAnnualEarningsMin?: unknown;
  targetAnnualEarningsTarget?: unknown;
  targetHourlyRateMin?: unknown;
  targetHourlyRateTarget?: unknown;
  compensationCurrency?: string | null;
  employmentTypes?: unknown;
  annualEarningsMinimumRequired?: boolean | null;
  hourlyRateMinimumRequired?: boolean | null;
  employmentTypeRequired?: boolean | null;
};

function decimalLikeToInput(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && "toString" in value) {
    const asString = String(
      (value as { toString: () => string }).toString(),
    ).trim();
    if (asString && asString !== "[object Object]") return asString;
  }
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? String(asNumber) : "";
}

function optionalIntToInput(value: unknown): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

/** Flatten Json list columns (array, JSON string, or comma string) for inputs. */
export function jsonListToInput(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean).join(", ");
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return jsonListToInput(parsed);
    } catch {
      // already a comma-separated string
    }
    return trimmed;
  }
  return "";
}

export function serializeIcpForClient(icp: IcpRecordSource): IcpClientRecord {
  return {
    id: icp.id,
    name: icp.name,
    description: icp.description ?? null,
    definition: icp.definition ?? null,
    additionalContext: icp.additionalContext ?? null,
    targetIndustries: icp.targetIndustries ?? null,
    minEmployees: icp.minEmployees ?? null,
    maxEmployees: icp.maxEmployees ?? null,
    minRevenue: decimalLikeToInput(icp.minRevenue) || null,
    maxRevenue: decimalLikeToInput(icp.maxRevenue) || null,
    targetGeographies: icp.targetGeographies ?? null,
    requiredTechnologies: icp.requiredTechnologies ?? null,
    positiveSignals: icp.positiveSignals ?? null,
    negativeSignals: icp.negativeSignals ?? null,
    notes: icp.notes ?? null,
    interpretationSummary: icp.interpretationSummary ?? null,
    interpretationUndetermined: icp.interpretationUndetermined ?? null,
    targetAnnualEarningsMin: decimalLikeToInput(icp.targetAnnualEarningsMin) || null,
    targetAnnualEarningsTarget:
      decimalLikeToInput(icp.targetAnnualEarningsTarget) || null,
    targetHourlyRateMin: decimalLikeToInput(icp.targetHourlyRateMin) || null,
    targetHourlyRateTarget: decimalLikeToInput(icp.targetHourlyRateTarget) || null,
    compensationCurrency: icp.compensationCurrency ?? null,
    employmentTypes: parseEmploymentTypeCodes(icp.employmentTypes),
    annualEarningsMinimumRequired: icp.annualEarningsMinimumRequired === true,
    hourlyRateMinimumRequired: icp.hourlyRateMinimumRequired === true,
    employmentTypeRequired: icp.employmentTypeRequired === true,
  };
}

export function icpRecordToFormValues(
  icp: IcpRecordSource,
  productId = "",
): IcpFormValues {
  return {
    id: icp.id,
    productId,
    name: icp.name,
    description: icp.description ?? "",
    definition: icp.definition ?? icp.description ?? "",
    additionalContext: icp.additionalContext ?? "",
    targetIndustries: jsonListToInput(icp.targetIndustries),
    minEmployees: optionalIntToInput(icp.minEmployees),
    maxEmployees: optionalIntToInput(icp.maxEmployees),
    minRevenue: decimalLikeToInput(icp.minRevenue),
    maxRevenue: decimalLikeToInput(icp.maxRevenue),
    targetGeographies: jsonListToInput(icp.targetGeographies),
    requiredTechnologies: jsonListToInput(icp.requiredTechnologies),
    positiveSignals: jsonListToInput(icp.positiveSignals),
    negativeSignals: jsonListToInput(icp.negativeSignals),
    notes: icp.notes ?? "",
    targetAnnualEarningsMin: decimalLikeToInput(icp.targetAnnualEarningsMin),
    targetAnnualEarningsTarget: decimalLikeToInput(icp.targetAnnualEarningsTarget),
    targetHourlyRateMin: decimalLikeToInput(icp.targetHourlyRateMin),
    targetHourlyRateTarget: decimalLikeToInput(icp.targetHourlyRateTarget),
    compensationCurrency:
      icp.compensationCurrency?.trim() || compensationConfig.defaultCurrency,
    employmentTypes: parseEmploymentTypeCodes(icp.employmentTypes).join(","),
    annualEarningsMinimumRequired: icp.annualEarningsMinimumRequired
      ? "true"
      : "",
    hourlyRateMinimumRequired: icp.hourlyRateMinimumRequired ? "true" : "",
    employmentTypeRequired: icp.employmentTypeRequired ? "true" : "",
  };
}

export function submittedIcpProfileIsBlank(fields: {
  description: string | null;
  definition: string | null;
  additionalContext: string | null;
  targetIndustries: string[];
  minEmployees: number | null;
  maxEmployees: number | null;
  minRevenue: number | null;
  maxRevenue: number | null;
  targetGeographies: string[];
  requiredTechnologies: string[];
  positiveSignals: string[];
  negativeSignals: string[];
  notes: string | null;
  targetAnnualEarningsMin: number | null;
  targetAnnualEarningsTarget: number | null;
  targetHourlyRateMin: number | null;
  targetHourlyRateTarget: number | null;
  employmentTypes: string[];
}): boolean {
  return (
    !fields.definition &&
    !fields.description &&
    !fields.additionalContext &&
    !fields.notes &&
    fields.targetIndustries.length === 0 &&
    fields.minEmployees == null &&
    fields.maxEmployees == null &&
    fields.minRevenue == null &&
    fields.maxRevenue == null &&
    fields.targetGeographies.length === 0 &&
    fields.requiredTechnologies.length === 0 &&
    fields.positiveSignals.length === 0 &&
    fields.negativeSignals.length === 0 &&
    fields.targetAnnualEarningsMin == null &&
    fields.targetAnnualEarningsTarget == null &&
    fields.targetHourlyRateMin == null &&
    fields.targetHourlyRateTarget == null &&
    fields.employmentTypes.length === 0
  );
}

export function storedIcpHasProfile(icp: IcpRecordSource): boolean {
  const values = icpRecordToFormValues(icp);
  return Boolean(
    values.definition.trim() ||
      values.description.trim() ||
      values.additionalContext.trim() ||
      values.notes.trim() ||
      values.targetIndustries.trim() ||
      values.minEmployees.trim() ||
      values.maxEmployees.trim() ||
      values.minRevenue.trim() ||
      values.maxRevenue.trim() ||
      values.targetGeographies.trim() ||
      values.requiredTechnologies.trim() ||
      values.positiveSignals.trim() ||
      values.negativeSignals.trim() ||
      values.targetAnnualEarningsMin.trim() ||
      values.targetAnnualEarningsTarget.trim() ||
      values.targetHourlyRateMin.trim() ||
      values.targetHourlyRateTarget.trim() ||
      values.employmentTypes.trim(),
  );
}

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function readChecked(formData: FormData, key: string): string {
  const value = String(formData.get(key) ?? "").trim().toLowerCase();
  return value === "true" || value === "on" || value === "1" ? "true" : "";
}

function readEmploymentTypes(formData: FormData): string {
  const raw = formData
    .getAll("employmentTypes")
    .flatMap((entry) => String(entry).split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
  const codes: string[] = [];
  for (const code of raw) {
    if (isEmploymentTypeCode(code) && !codes.includes(code)) codes.push(code);
  }
  return codes.join(",");
}

export function readIcpFormValues(formData: FormData): IcpFormValues {
  return {
    id: readString(formData, "id"),
    productId: readString(formData, "productId"),
    name: readString(formData, "name"),
    description: readString(formData, "description"),
    definition: readString(formData, "definition"),
    additionalContext: readString(formData, "additionalContext"),
    targetIndustries: readString(formData, "targetIndustries"),
    minEmployees: readString(formData, "minEmployees"),
    maxEmployees: readString(formData, "maxEmployees"),
    minRevenue: readString(formData, "minRevenue"),
    maxRevenue: readString(formData, "maxRevenue"),
    targetGeographies: readString(formData, "targetGeographies"),
    requiredTechnologies: readString(formData, "requiredTechnologies"),
    positiveSignals: readString(formData, "positiveSignals"),
    negativeSignals: readString(formData, "negativeSignals"),
    notes: readString(formData, "notes"),
    targetAnnualEarningsMin: readString(formData, "targetAnnualEarningsMin"),
    targetAnnualEarningsTarget: readString(formData, "targetAnnualEarningsTarget"),
    targetHourlyRateMin: readString(formData, "targetHourlyRateMin"),
    targetHourlyRateTarget: readString(formData, "targetHourlyRateTarget"),
    compensationCurrency:
      readString(formData, "compensationCurrency") ||
      compensationConfig.defaultCurrency,
    employmentTypes: readEmploymentTypes(formData),
    annualEarningsMinimumRequired: readChecked(
      formData,
      "annualEarningsMinimumRequired",
    ),
    hourlyRateMinimumRequired: readChecked(formData, "hourlyRateMinimumRequired"),
    employmentTypeRequired: readChecked(formData, "employmentTypeRequired"),
  };
}

export function parseIcpFormData(formData: FormData): {
  id: string;
  productId: string;
  values: IcpFormValues;
  fields: {
    name: string;
    description: string | null;
    definition: string | null;
    additionalContext: string | null;
    targetIndustries: string[];
    minEmployees: number | null;
    maxEmployees: number | null;
    minRevenue: number | null;
    maxRevenue: number | null;
    targetGeographies: string[];
    requiredTechnologies: string[];
    positiveSignals: string[];
    negativeSignals: string[];
    notes: string | null;
    targetAnnualEarningsMin: number | null;
    targetAnnualEarningsTarget: number | null;
    targetHourlyRateMin: number | null;
    targetHourlyRateTarget: number | null;
    compensationCurrency: string | null;
    employmentTypes: string[];
    annualEarningsMinimumRequired: boolean;
    hourlyRateMinimumRequired: boolean;
    employmentTypeRequired: boolean;
  };
  fieldErrors: Partial<Record<keyof IcpFormValues, string>>;
} {
  const values = readIcpFormValues(formData);
  const fieldErrors: Partial<Record<keyof IcpFormValues, string>> = {};

  if (!values.productId) {
    fieldErrors.productId = `${vocab.product.Singular} is required.`;
  }
  if (!values.name) {
    fieldErrors.name = `${vocab.icp.singular} name is required.`;
  }
  if (!values.definition.trim()) {
    fieldErrors.definition = `Describe the kind of company you want to work for before saving. Interpretation uses this definition.`;
  }

  const minEmployees = toOptionalInt(values.minEmployees);
  const maxEmployees = toOptionalInt(values.maxEmployees);
  const minRevenue = toOptionalFloat(values.minRevenue);
  const maxRevenue = toOptionalFloat(values.maxRevenue);

  if (values.minEmployees && minEmployees == null) {
    fieldErrors.minEmployees = "Minimum employees must be a whole number.";
  }
  if (values.maxEmployees && maxEmployees == null) {
    fieldErrors.maxEmployees = "Maximum employees must be a whole number.";
  }
  if (values.minRevenue && minRevenue == null) {
    fieldErrors.minRevenue = "Minimum revenue must be a number.";
  }
  if (values.maxRevenue && maxRevenue == null) {
    fieldErrors.maxRevenue = "Maximum revenue must be a number.";
  }

  const targetAnnualEarningsMin = toOptionalFloat(values.targetAnnualEarningsMin);
  const targetAnnualEarningsTarget = toOptionalFloat(values.targetAnnualEarningsTarget);
  const targetHourlyRateMin = toOptionalFloat(values.targetHourlyRateMin);
  const targetHourlyRateTarget = toOptionalFloat(values.targetHourlyRateTarget);
  const employmentTypes = parseEmploymentTypeCodes(values.employmentTypes);
  const annualEarningsMinimumRequired = values.annualEarningsMinimumRequired === "true";
  const hourlyRateMinimumRequired = values.hourlyRateMinimumRequired === "true";
  const employmentTypeRequired = values.employmentTypeRequired === "true";

  if (values.targetAnnualEarningsMin && targetAnnualEarningsMin == null) {
    fieldErrors.targetAnnualEarningsMin = "Annual minimum must be a number.";
  }
  if (values.targetAnnualEarningsTarget && targetAnnualEarningsTarget == null) {
    fieldErrors.targetAnnualEarningsTarget = "Annual target must be a number.";
  }
  if (values.targetHourlyRateMin && targetHourlyRateMin == null) {
    fieldErrors.targetHourlyRateMin = "Hourly minimum must be a number.";
  }
  if (values.targetHourlyRateTarget && targetHourlyRateTarget == null) {
    fieldErrors.targetHourlyRateTarget = "Hourly target must be a number.";
  }
  if (
    (targetAnnualEarningsMin != null && targetAnnualEarningsMin < 0) ||
    (targetAnnualEarningsTarget != null && targetAnnualEarningsTarget < 0)
  ) {
    fieldErrors.targetAnnualEarningsMin = "Annual earnings cannot be negative.";
  }
  if (
    (targetHourlyRateMin != null && targetHourlyRateMin < 0) ||
    (targetHourlyRateTarget != null && targetHourlyRateTarget < 0)
  ) {
    fieldErrors.targetHourlyRateMin = "Hourly rate cannot be negative.";
  }
  if (
    targetAnnualEarningsMin != null &&
    targetAnnualEarningsTarget != null &&
    targetAnnualEarningsMin > targetAnnualEarningsTarget
  ) {
    fieldErrors.targetAnnualEarningsMin =
      "Annual minimum cannot be above the annual target.";
  }
  if (
    targetHourlyRateMin != null &&
    targetHourlyRateTarget != null &&
    targetHourlyRateMin > targetHourlyRateTarget
  ) {
    fieldErrors.targetHourlyRateMin =
      "Hourly minimum cannot be above the hourly target.";
  }
  if (annualEarningsMinimumRequired && targetAnnualEarningsMin == null) {
    fieldErrors.annualEarningsMinimumRequired =
      `Set an annual minimum before marking it ${criterionFlags.required}.`;
  }
  if (hourlyRateMinimumRequired && targetHourlyRateMin == null) {
    fieldErrors.hourlyRateMinimumRequired =
      `Set an hourly minimum before marking it ${criterionFlags.required}.`;
  }
  if (employmentTypeRequired && employmentTypes.length === 0) {
    fieldErrors.employmentTypeRequired =
      `Select an employment type before marking it ${criterionFlags.required}.`;
  }

  const currencyRaw = values.compensationCurrency.trim();
  let compensationCurrency: string | null = null;
  const hasAmount =
    targetAnnualEarningsMin != null ||
    targetAnnualEarningsTarget != null ||
    targetHourlyRateMin != null ||
    targetHourlyRateTarget != null;
  if (hasAmount) {
    const code = (currencyRaw || compensationConfig.defaultCurrency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      fieldErrors.compensationCurrency = "Currency must be a 3-letter code.";
    } else {
      compensationCurrency = code;
    }
  }

  return {
    id: values.id,
    productId: values.productId,
    values,
    fieldErrors,
    fields: {
      name: values.name,
      description: values.description || null,
      definition: values.definition || null,
      additionalContext: values.additionalContext || null,
      targetIndustries: parseCommaList(values.targetIndustries),
      minEmployees,
      maxEmployees,
      minRevenue,
      maxRevenue,
      targetGeographies: parseCommaList(values.targetGeographies),
      requiredTechnologies: parseCommaList(values.requiredTechnologies),
      positiveSignals: parseCommaList(values.positiveSignals),
      negativeSignals: parseCommaList(values.negativeSignals),
      notes: values.notes || null,
      targetAnnualEarningsMin,
      targetAnnualEarningsTarget,
      targetHourlyRateMin,
      targetHourlyRateTarget,
      compensationCurrency,
      employmentTypes,
      annualEarningsMinimumRequired,
      hourlyRateMinimumRequired,
      employmentTypeRequired,
    },
  };
}

export class IcpValidationError extends Error {
  readonly values: IcpFormValues;
  readonly fieldErrors: Partial<Record<keyof IcpFormValues, string>>;

  constructor(
    message: string,
    values: IcpFormValues,
    fieldErrors: Partial<Record<keyof IcpFormValues, string>>,
  ) {
    super(message);
    this.name = "IcpValidationError";
    this.values = values;
    this.fieldErrors = fieldErrors;
  }
}

/** Safe, user-facing error — never Prisma / stack / tenant ids. */
export function toSafeIcpActionError(error: unknown): string {
  if (error instanceof IcpValidationError) return error.message;
  if (error instanceof TenantError) return error.message;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return `${vocab.icp.ASingular} with this name may already exist for this ${vocab.product.singular}.`;
    }
    if (msg.includes("foreign key") || msg.includes("restrict")) {
      return `This ${vocab.icp.singular} could not be saved because of a ${vocab.product.singular} relationship conflict.`;
    }
  }
  return `Unable to save ${vocab.icp.singular}. Please try again.`;
}

function toOptionalInt(raw: string): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function toOptionalFloat(raw: string): number | null {
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

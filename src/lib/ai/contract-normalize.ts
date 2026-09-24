/**
 * Shared normalization for AI synthesis contracts (confidence, evidenceRefs).
 */

export const CONFIDENCE_VALUES = ["HIGH", "MEDIUM", "LOW"] as const;
export type ConfidenceValue = (typeof CONFIDENCE_VALUES)[number];

export type NormalizedEvidenceRef = {
  claim: string;
  sourceIds: string[];
  note: string | null;
  provenanceClasses?: Array<
    "CUSTOMER_EVIDENCE" | "WEB_EVIDENCE" | "MODEL_INFERENCE"
  >;
};

export function normalizeConfidenceValue(
  value: unknown,
  coercedFields: Set<string>,
  fieldPath: string,
): ConfidenceValue {
  if (value === undefined || value === null) {
    return "MEDIUM";
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const upper = trimmed.toUpperCase();
    if ((CONFIDENCE_VALUES as readonly string[]).includes(upper)) {
      if (upper !== value || trimmed !== value) {
        coercedFields.add(fieldPath);
      }
      return upper as ConfidenceValue;
    }
    coercedFields.add(fieldPath);
    return "MEDIUM";
  }
  coercedFields.add(fieldPath);
  return "MEDIUM";
}

export function normalizeEvidenceRefs(
  value: unknown,
  coercedFields: Set<string>,
  fieldPath: string,
  options?: {
    provenanceClasses?: boolean;
  },
): NormalizedEvidenceRef[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    coercedFields.add(fieldPath);
    return [];
  }

  const out: NormalizedEvidenceRef[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item === "string") {
      const claim = item.trim();
      if (!claim) continue;
      coercedFields.add(`${fieldPath}[${i}]`);
      out.push({
        claim,
        sourceIds: [],
        note: null,
        ...(options?.provenanceClasses
          ? { provenanceClasses: [] as NormalizedEvidenceRef["provenanceClasses"] }
          : {}),
      });
      continue;
    }
    if (!item || typeof item !== "object") {
      coercedFields.add(fieldPath);
      continue;
    }

    const obj = item as Record<string, unknown>;
    const claim =
      typeof obj.claim === "string"
        ? obj.claim.trim()
        : typeof obj.text === "string"
          ? obj.text.trim()
          : "";
    if (!claim) {
      coercedFields.add(fieldPath);
      continue;
    }
    if (typeof obj.claim !== "string") {
      coercedFields.add(`${fieldPath}[${i}].claim`);
    }

    const sourceIds = Array.isArray(obj.sourceIds)
      ? obj.sourceIds.map(String).map((s) => s.trim()).filter(Boolean)
      : [];

    const note =
      obj.note == null
        ? null
        : typeof obj.note === "string"
          ? obj.note
          : null;

    const normalized: NormalizedEvidenceRef = {
      claim,
      sourceIds,
      note,
    };

    if (options?.provenanceClasses) {
      normalized.provenanceClasses = Array.isArray(obj.provenanceClasses)
        ? obj.provenanceClasses
            .map(String)
            .filter((c): c is NonNullable<NormalizedEvidenceRef["provenanceClasses"]>[number] =>
              c === "CUSTOMER_EVIDENCE" ||
              c === "WEB_EVIDENCE" ||
              c === "MODEL_INFERENCE",
            )
        : [];
    }

    out.push(normalized);
  }

  if (value.length > 0 && out.length < value.length) {
    coercedFields.add(fieldPath);
  }

  return out;
}

export function summarizeCoercedFields(
  coercedFields: Iterable<string>,
): string[] {
  const summary = new Set<string>();
  for (const path of coercedFields) {
    if (path.includes("confidence")) {
      summary.add("confidence");
    } else if (path.includes("evidenceRefs")) {
      summary.add("evidenceRefs");
    } else {
      summary.add(path.split(".")[0] || path);
    }
  }
  return [...summary].sort();
}

/** Strict JSON Schema may emit null for optional fields; normalize to absent for Zod defaults. */
export function normalizeAbsentNulls(value: unknown): unknown {
  if (value === null) return undefined;
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeAbsentNulls(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeAbsentNulls(entry),
      ]),
    );
  }
  return value;
}

export type QualityIssue = {
  check: string;
  field: string;
  text: string;
  message: string;
};

export function qualityIssue(input: {
  check: string;
  field: string;
  text: string;
  message: string;
}): QualityIssue {
  return {
    check: input.check,
    field: input.field,
    text: input.text.trim(),
    message: input.message,
  };
}

export function qualityMessages(issues: readonly QualityIssue[]): string[] {
  return issues.map((issue) => issue.message);
}

export function logQualityRejection(input: {
  generator: string;
  attempt: number;
  issues: readonly QualityIssue[];
}): void {
  for (const issue of input.issues) {
    console.error(
      JSON.stringify({
        event: "generation_quality_rejected",
        generator: input.generator,
        attempt: input.attempt,
        check: issue.check,
        field: issue.field,
        text: issue.text.slice(0, 400),
      }),
    );
  }
}

/** Silent cleanup for customer-facing text. Never a rejection. */
export function replaceEmDashes(text: string): string {
  return text
    .replace(/\s*—\s*/g, ", ")
    .replace(/—/g, ", ")
    .replace(/,\s*,+/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function replaceEmDashesDeep<T>(value: T): T {
  if (typeof value === "string") return replaceEmDashes(value) as T;
  if (Array.isArray(value)) {
    return value.map((item) => replaceEmDashesDeep(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceEmDashesDeep(item),
      ]),
    ) as T;
  }
  return value;
}

export function issuesForField(
  issues: readonly QualityIssue[],
  field: string,
): QualityIssue[] {
  return issues.filter((issue) => issue.field === field);
}

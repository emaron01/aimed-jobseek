import type { ExclusionDetail, ExclusionSourceKind } from "@/lib/scoring/exclusion-detail";
import { vocab } from "@/lib/product-config";

function sourceKindLabel(kind: ExclusionSourceKind): string {
  switch (kind) {
    case "LIST":
      return `${vocab.list.Singular} data`;
    case "RESEARCH":
      return "Research";
    case "TITLE":
      return "Title";
    case "CONTACT_RESEARCH":
      return `${vocab.contact.Singular} research`;
    default:
      return "Evidence";
  }
}

export function ExclusionDetailList({
  details,
  compact = false,
}: {
  details: ExclusionDetail[];
  compact?: boolean;
}) {
  if (details.length === 0) return null;

  return (
    <ul
      className={
        compact
          ? "space-y-2 text-sm text-ink"
          : "space-y-2 rounded-md border border-danger bg-danger-tint px-3 py-2 text-sm text-danger"
      }
      data-testid="exclusion-details"
    >
      {details.map((detail) => (
        <li key={`${detail.kind}:${detail.criterionId ?? detail.criterionName}`}>
          {detail.kind === "ICP" ? (
            <div className="space-y-1">
              <p className="font-medium">{detail.criterionRange}</p>
              {detail.resolvedValue ? (
                <p>
                  Value: <span className="font-medium">{detail.resolvedValue}</span>
                </p>
              ) : null}
              <p className="text-muted">{detail.comparison}</p>
              <p className="text-xs text-subtle">
                Source ({sourceKindLabel(detail.sourceKind)}): {detail.sourceLabel}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="font-medium">{vocab.persona.Singular} exclusion: {detail.criterionName}</p>
              <p>
                Matched: <span className="font-medium">{detail.matchedText}</span>
              </p>
              <p className="text-xs text-subtle">{detail.sourceLabel}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

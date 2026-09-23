/**
 * Job-seeker research persistence.
 * Hiring and growth stay on hiringSignals. They are never written to buyingSignals.
 * Average order value is not stored for this research.
 */

export function jobSeekerResearchColumns(result: {
  hiringSignals?: string[] | null;
  buyingSignals?: string[] | null;
  estimatedAov?: string | null;
  aovReasoning?: string | null;
}): {
  hiringSignals: string[];
  buyingSignals: string[];
  estimatedAov: null;
  aovReasoning: null;
} {
  const hiringSignals = (result.hiringSignals ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    hiringSignals,
    buyingSignals: [],
    estimatedAov: null,
    aovReasoning: null,
  };
}

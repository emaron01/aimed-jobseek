import type { ApplicationStepKey } from "@/lib/product-config/application-steps";

/**
 * Steps that expand under their card on the Application Dashboard.
 * Later batches add a key here and a panel in DashboardInPlaceStepPanels.
 */
export const DASHBOARD_IN_PLACE_STEP_KEYS = [
  "applied",
  "job",
  "company",
  "consultation",
  "assets",
  "hiring-team",
  "outreach",
  "interviews",
  "summary",
] as const;

export type DashboardInPlaceStepKey = (typeof DASHBOARD_IN_PLACE_STEP_KEYS)[number];

export function isDashboardInPlaceStep(
  key: ApplicationStepKey,
): key is DashboardInPlaceStepKey {
  return (DASHBOARD_IN_PLACE_STEP_KEYS as readonly string[]).includes(key);
}

export function parseDashboardOpenSteps(
  raw: string | null | undefined,
): DashboardInPlaceStepKey[] {
  if (!raw) return [];
  const wanted = new Set(
    raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  return DASHBOARD_IN_PLACE_STEP_KEYS.filter((key) => wanted.has(key));
}

export function closeDashboardOpenStep(
  current: readonly DashboardInPlaceStepKey[],
  key: DashboardInPlaceStepKey,
): DashboardInPlaceStepKey[] {
  return DASHBOARD_IN_PLACE_STEP_KEYS.filter((item) => current.includes(item) && item !== key);
}

export function toggleDashboardOpenStep(
  current: readonly DashboardInPlaceStepKey[],
  key: DashboardInPlaceStepKey,
): DashboardInPlaceStepKey[] {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return DASHBOARD_IN_PLACE_STEP_KEYS.filter((item) => next.has(item));
}

/**
 * Hash to keep after opening or closing a dashboard step.
 * Harper question hashes belong on the Harper page, not the dashboard URL.
 */
export function dashboardStepHash(
  stepKey: DashboardInPlaceStepKey,
  hash: string,
): string {
  if (stepKey === "applied" && hash === "#applied") return "";
  if (stepKey !== "consultation" || hash.length <= 1) return hash;
  let decoded = hash.slice(1);
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    decoded = hash.slice(1);
  }
  if (
    decoded === "consultation" ||
    decoded === "harper-standing" ||
    decoded === "harper-general" ||
    decoded.startsWith("harper-q:") ||
    decoded.startsWith("harper-coach:")
  ) {
    return "";
  }
  return hash;
}

/** Query value. Empty means the param should be removed. */
export function serializeDashboardOpenSteps(
  keys: readonly DashboardInPlaceStepKey[],
): string {
  return DASHBOARD_IN_PLACE_STEP_KEYS.filter((key) => keys.includes(key)).join(",");
}

export function dashboardOpenSearch(
  search: string,
  keys: readonly DashboardInPlaceStepKey[],
): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const serialized = serializeDashboardOpenSteps(keys);
  if (serialized) params.set("open", serialized);
  else params.delete("open");
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** One-column order: the panel sits immediately under its card. */
export function dashboardStepCardOrder(index: number): number {
  return index * 2;
}

export function dashboardStepPanelOrder(index: number, columns: 1 | 2): number {
  if (columns === 1) return index * 2 + 1;
  return Math.floor(index / 2) * 4 + 3;
}

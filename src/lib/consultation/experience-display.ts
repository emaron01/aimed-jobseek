/**
 * Seeker-facing experience summary for Harper standing.
 * No months, year ranges, or role date lists.
 */

export function formatListPlain(items: string[]): string {
  const cleaned = items.map((item) => item.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0]!;
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned[cleaned.length - 1]}`;
}

export function formatExperienceLine(input: {
  totalYears: number;
  periods: Array<{ roleId: string }>;
  missingDateRoleIds: string[];
  roles: Array<{
    id: string;
    employer?: string | null;
    title?: string | null;
    label: string;
  }>;
}): string {
  const byId = new Map(input.roles.map((role) => [role.id, role]));
  const employers: string[] = [];
  const seenEmployers = new Set<string>();
  for (const period of input.periods) {
    const role = byId.get(period.roleId);
    const employer = role?.employer?.trim() || "";
    if (!employer) continue;
    const key = employer.toLowerCase();
    if (seenEmployers.has(key)) continue;
    seenEmployers.add(key);
    employers.push(employer);
  }
  const years = Math.round(input.totalYears);
  const across =
    employers.length > 0 ? ` across ${formatListPlain(employers)}` : "";
  let sentence = "";
  if (years > 0) {
    sentence = `About ${years} year${years === 1 ? "" : "s"} of relevant experience${across}.`;
  } else if (employers.length > 0) {
    sentence = `Relevant experience${across}.`;
  }
  const missingNames = input.missingDateRoleIds.flatMap((id) => {
    const role = byId.get(id);
    if (!role) return [];
    const title = role.title?.trim() || "";
    const employer = role.employer?.trim() || "";
    if (title && employer) return [`${title} at ${employer}`];
    if (title || employer) return [title || employer];
    const label = role.label.trim();
    return label ? [label] : [];
  });
  const missing =
    missingNames.length > 0
      ? `Add dates for ${formatListPlain(missingNames)}.`
      : "";
  return [sentence, missing].filter(Boolean).join(" ").trim();
}

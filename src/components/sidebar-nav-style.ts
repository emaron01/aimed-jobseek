/**
 * One style for every side navigation item, main and application.
 * Unselected: white surface with black ink.
 * Selected: light blue from the primary token at 10% opacity, with black ink.
 * primary is #1D4ED8 (`--color-primary` / `designTokens.color.primary`).
 */
export const sidebarNavItemLayoutClass =
  "block rounded-md px-3 py-2 text-sm font-medium text-ink transition-colors";

export const sidebarNavItemIdleClass = "bg-surface text-ink hover:bg-surface";

export const sidebarNavItemCurrentClass = "bg-primary/10 text-ink";

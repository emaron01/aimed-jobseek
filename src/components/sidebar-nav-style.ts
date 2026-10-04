/**
 * One style for every side navigation item, main and application.
 * Unselected: white surface with black ink.
 * Selected and pressed: opaque very light blue (`primaryTint` #E7F3FF) with black ink.
 * The tint is solid so it stays light on the navy sidebar.
 */
export const sidebarNavItemLayoutClass =
  "block rounded-md px-3 py-2 text-sm font-medium text-ink transition-colors";

export const sidebarNavItemIdleClass =
  "bg-surface text-ink hover:bg-surface active:bg-primary-tint";

export const sidebarNavItemCurrentClass = "bg-primary-tint text-ink";

export const sidebarNavItemBranchClass =
  "block rounded-md px-2 py-1 text-xs font-medium text-ink";

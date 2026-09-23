import { anyListFeatureEnabled, vocab } from "@/lib/product-config";
/**
 * Pure menu/nav model for authenticated users.
 * Platform-only SUPER_ADMIN (no Organization) is a first-class case.
 * SUPPORT sees Platform (read-only org console); email-templates stay SUPER_ADMIN-only.
 */
export type MembershipRoleForMenu = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export type AuthenticatedNavInput = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  platformRole: "NONE" | "SUPER_ADMIN" | "SUPPORT" | string;
  organizationName?: string | null;
  membershipRole?: MembershipRoleForMenu | null;
};

export type UserMenuLink = {
  href: string;
  label: string;
  /** Shown in tests / a11y as distinct action ids */
  id:
    | "account_settings"
    | "organization_settings"
    | "platform_admin"
    | "support"
    | "log_out";
};

export type UserMenuWorkspaceOption = {
  organizationId: string;
  name: string;
  isActive: boolean;
};

export type UserMenuModel = {
  displayName: string | null;
  email: string;
  organizationName: string | null;
  platformRoleLabel: "SUPER_ADMIN" | "SUPPORT" | null;
  showOrganizationSettings: boolean;
  showPlatformAdmin: boolean;
  /** Avatar / header initial — never invents an org name */
  avatarInitial: string;
  links: UserMenuLink[];
  /**
   * Workspaces for the switcher. Empty or a single entry means hide the
   * switcher (only shown when the user belongs to more than one org).
   */
  workspaces: UserMenuWorkspaceOption[];
};

export type SidebarNavItem = {
  href: string;
  label: string;
  separatorBefore?: boolean;
  /** Additional path prefixes that should highlight this item (e.g. /setup under Products). */
  activePrefixes?: string[];
};

export function displayNameFromUser(input: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}): string | null {
  const fromParts = [input.firstName, input.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (fromParts) return fromParts;
  const name = input.name?.trim();
  return name || null;
}

function canManageOrgSettings(
  role: MembershipRoleForMenu | null | undefined,
): boolean {
  return role === "OWNER" || role === "ADMIN";
}

function isPlatformOperatorRole(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "SUPPORT";
}

/**
 * Build the authenticated user-menu model.
 * Logout is always included when the menu is shown.
 */
export function buildUserMenuModel(
  input: AuthenticatedNavInput & {
    paymentLocked?: boolean;
    workspaces?: UserMenuWorkspaceOption[];
  },
): UserMenuModel {
  const displayName = displayNameFromUser(input);
  const organizationName = input.organizationName?.trim() || null;
  const isSuperAdmin = input.platformRole === "SUPER_ADMIN";
  const isSupport = input.platformRole === "SUPPORT";
  const showOrganizationSettings =
    !input.paymentLocked &&
    Boolean(organizationName) &&
    canManageOrgSettings(input.membershipRole ?? null);
  const showPlatformAdmin = isPlatformOperatorRole(input.platformRole);

  const links: UserMenuLink[] = [];

  if (!input.paymentLocked) {
    links.push({
      id: "account_settings",
      href: "/settings/account",
      label: "Account Settings",
    });
  }

  if (showOrganizationSettings) {
    links.push({
      id: "organization_settings",
      href: "/settings",
      label: "Organization Settings",
    });
  }

  if (showPlatformAdmin) {
    links.push({
      id: "platform_admin",
      href: "/platform",
      label: isSupport ? "Platform Support" : "Platform Administration",
    });
  }

  links.push({
    id: "support",
    href: "/support",
    label: "Support",
  });

  links.push({
    id: "log_out",
    href: "#logout",
    label: "Log Out",
  });

  const avatarSource = displayName || input.email || "?";
  return {
    displayName,
    email: input.email,
    organizationName,
    platformRoleLabel: isSuperAdmin
      ? "SUPER_ADMIN"
      : isSupport
        ? "SUPPORT"
        : null,
    showOrganizationSettings,
    showPlatformAdmin,
    avatarInitial: avatarSource.slice(0, 1).toUpperCase(),
    links,
    workspaces: input.workspaces ?? [],
  };
}

/**
 * Sidebar items for the current identity.
 * Platform operators without an Organization do not get fake customer workspace links.
 */
export function buildSidebarNavItems(input: {
  hasOrganization: boolean;
  isPlatformOperator: boolean;
  /** @deprecated use isPlatformOperator */
  isSuperAdmin?: boolean;
  /** When true, only Billing (and Platform for operators). */
  paymentLocked?: boolean;
}): SidebarNavItem[] {
  const isOperator =
    input.isPlatformOperator || Boolean(input.isSuperAdmin);

  if (input.paymentLocked && input.hasOrganization) {
    const items: SidebarNavItem[] = [
      { href: "/settings/billing", label: "Billing" },
    ];
    if (isOperator) {
      items.push({
        href: "/platform",
        label: "Platform",
        separatorBefore: true,
      });
    }
    return items;
  }

  if (!input.hasOrganization) {
    const items: SidebarNavItem[] = [
      { href: "/settings/account", label: "Account" },
    ];
    if (isOperator) {
      items.unshift({
        href: "/platform",
        label: "Platform",
      });
    }
    return items;
  }

  const items: SidebarNavItem[] = [
    { href: "/", label: "Home" },
    { href: "/campaigns", label: vocab.campaign.Plural },
    ...(anyListFeatureEnabled()
      ? [{ href: "/lists", label: vocab.list.Plural }]
      : []),
    { href: "/contacts", label: vocab.contact.Plural },
    {
      href: "/products",
      label: vocab.product.Plural,
      separatorBefore: true,
      activePrefixes: ["/products", "/setup"],
    },
    { href: "/icps", label: vocab.icp.plural },
    { href: "/personas", label: vocab.persona.Plural },
    {
      href: "/settings/voice",
      label: "Your Voice",
      separatorBefore: true,
    },
    { href: "/settings/email", label: "Email Connection" },
    { href: "/settings", label: "Settings" },
    { href: "/settings/account", label: "Account" },
  ];
  if (isOperator) {
    items.push({
      href: "/platform",
      label: "Platform",
    });
  }
  return items;
}

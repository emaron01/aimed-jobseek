"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import {
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";

export type AppButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "warning"
  | "orange"
  | "lightOrange"
  | "lightRed"
  | "success"
  | "chip";

const VARIANT_CLASS: Record<AppButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-hover focus-visible:outline-focus disabled:bg-edge-strong disabled:text-on-ink",
  secondary:
    "border border-edge-strong bg-surface text-ink shadow-sm hover:border-edge-strong hover:bg-canvas active:bg-canvas focus-visible:outline-focus disabled:border-edge disabled:bg-canvas disabled:text-subtle disabled:shadow-none",
  danger:
    "bg-danger text-on-ink hover:bg-danger active:bg-danger focus-visible:outline-focus disabled:bg-edge-strong disabled:text-on-ink",
  warning:
    "border border-warning bg-warning text-on-ink hover:bg-warning active:bg-warning focus-visible:outline-focus disabled:bg-edge-strong disabled:text-on-ink",
  orange:
    "border border-bright-orange bg-bright-orange text-on-bright-orange hover:bg-bright-orange active:bg-bright-orange focus-visible:outline-focus disabled:bg-edge-strong disabled:text-on-ink",
  lightOrange:
    "bg-light-orange text-on-light-orange hover:bg-light-orange-hover focus-visible:bg-light-orange-hover active:bg-light-orange-hover focus-visible:outline-focus disabled:bg-edge-strong disabled:text-on-ink",
  lightRed:
    "bg-danger-tint text-danger hover:bg-danger-tint focus-visible:bg-danger-tint active:bg-danger-tint focus-visible:outline-focus disabled:bg-edge-strong disabled:text-on-ink",
  success:
    "cursor-pointer bg-success text-on-ink hover:bg-success-tint hover:text-success focus-visible:bg-success-tint focus-visible:text-success active:bg-success-tint active:text-success focus-visible:outline-focus disabled:bg-edge-strong disabled:text-on-ink",
  chip:
    "border border-edge-strong bg-surface px-2 py-0.5 text-[11px] text-ink underline decoration-edge-strong underline-offset-2 shadow-sm hover:bg-canvas active:bg-canvas focus-visible:outline-focus disabled:border-edge disabled:text-subtle disabled:no-underline",
};

const BUTTON_SIZE_CLASS = {
  md: "px-3.5 py-2 text-sm",
  sm: "px-2.5 py-1 text-xs",
  /** 24px call to action, one line. */
  cta: "whitespace-nowrap px-5 py-2 text-2xl",
} as const;

export type AppButtonSize = keyof typeof BUTTON_SIZE_CLASS;

const BASE_CLASS =
  "inline-flex cursor-pointer items-center justify-center rounded-md px-3.5 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

function buttonSizeClass(size: AppButtonSize): string {
  if (size === "md") return BASE_CLASS;
  return BASE_CLASS.replace("px-3.5 py-2 text-sm", BUTTON_SIZE_CLASS[size]);
}

export const PRIMARY_BUTTON_CLASS = `${BASE_CLASS} ${VARIANT_CLASS.primary}`;
export const SECONDARY_BUTTON_CLASS = `${BASE_CLASS} ${VARIANT_CLASS.secondary}`;
export const SECONDARY_CHIP_CLASS = `${BASE_CLASS} ${VARIANT_CLASS.chip}`;

export function AppPendingIndicator({
  label,
  light = false,
}: {
  label?: string;
  light?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={
          light
            ? "inline-block h-4 w-4 animate-spin rounded-full border-2 border-on-primary/40 border-t-on-primary"
            : "inline-block h-4 w-4 animate-spin rounded-full border-2 border-edge-strong border-t-ink"
        }
        aria-hidden
        data-testid="action-pending-spinner"
      />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

function AppButtonInner({
  children,
  variant = "primary",
  size = "md",
  pending = false,
  pendingLabel,
  disabledReason,
  className = "",
  type = "button",
  disabled,
  title,
  formPending = false,
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  pending?: boolean;
  pendingLabel?: string;
  disabledReason?: string;
  formPending?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  const isPending = Boolean(pending || formPending);
  const isDisabled = Boolean(disabled || isPending);
  const why = isDisabled ? disabledReason || title : title;
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={isDisabled}
      title={why}
      aria-busy={isPending || undefined}
      aria-disabled={isDisabled || undefined}
      className={`${buttonSizeClass(size)} ${VARIANT_CLASS[variant]} ${className}`.trim()}
    >
      {isPending ? (
        <AppPendingIndicator
          label={pendingLabel ?? (typeof children === "string" ? children : "Working…")}
          light={variant === "primary" || variant === "danger"}
        />
      ) : (
        children
      )}
    </button>
  );
}

function SubmitAppButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: AppButtonVariant;
    size?: AppButtonSize;
    pending?: boolean;
    pendingLabel?: string;
    disabledReason?: string;
  },
) {
  const { pending } = useFormStatus();
  return <AppButtonInner {...props} type="submit" formPending={pending} />;
}

export function AppButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: AppButtonVariant;
    size?: AppButtonSize;
    pending?: boolean;
    pendingLabel?: string;
    disabledReason?: string;
    ref?: Ref<HTMLButtonElement>;
  },
) {
  if ((props.type ?? "button") === "submit") {
    return <SubmitAppButton {...props} />;
  }
  return <AppButtonInner {...props} />;
}

export function AppActionLink({
  href,
  children,
  variant = "secondary",
  size = "md",
  className = "",
  pending = false,
  pendingLabel,
  disabled = false,
  disabledReason,
  title,
  onClick,
  target,
  rel,
  "data-testid": testId,
}: {
  href: string;
  children: ReactNode;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  className?: string;
  pending?: boolean;
  pendingLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
  title?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  target?: string;
  rel?: string;
  "data-testid"?: string;
}) {
  const isDisabled = disabled || pending;
  const classes = `${buttonSizeClass(size)} ${VARIANT_CLASS[variant]} ${className}`.trim();
  if (isDisabled) {
    return (
      <span
        role="link"
        aria-disabled="true"
        title={disabledReason || title}
        className={`${classes} pointer-events-none`}
        data-testid={testId}
      >
        {pending ? (
          <AppPendingIndicator
            label={pendingLabel ?? (typeof children === "string" ? children : "Working…")}
            light={variant === "primary" || variant === "danger"}
          />
        ) : (
          children
        )}
      </span>
    );
  }
  if (
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("https://") ||
    href.startsWith("http://")
  ) {
    return (
      <a
        href={href}
        className={classes}
        title={title}
        onClick={onClick}
        target={target}
        rel={rel}
        data-testid={testId}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} title={title} onClick={onClick} data-testid={testId}>
      {children}
    </Link>
  );
}

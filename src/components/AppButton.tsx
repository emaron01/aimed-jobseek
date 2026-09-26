"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import {
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";

export type AppButtonVariant = "primary" | "secondary" | "danger" | "chip";

const VARIANT_CLASS: Record<AppButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-hover focus-visible:outline-focus disabled:bg-edge-strong disabled:text-on-ink",
  secondary:
    "border border-edge-strong bg-surface text-ink shadow-sm hover:border-edge-strong hover:bg-canvas active:bg-canvas focus-visible:outline-focus disabled:border-edge disabled:bg-canvas disabled:text-subtle disabled:shadow-none",
  danger:
    "bg-danger text-on-ink hover:bg-danger active:bg-danger focus-visible:outline-focus disabled:bg-edge-strong disabled:text-on-ink",
  chip:
    "border border-edge-strong bg-surface px-2 py-0.5 text-[11px] text-ink underline decoration-edge-strong underline-offset-2 shadow-sm hover:bg-canvas active:bg-canvas focus-visible:outline-focus disabled:border-edge disabled:text-subtle disabled:no-underline",
};

const BASE_CLASS =
  "inline-flex cursor-pointer items-center justify-center rounded-md px-3.5 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

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
      className={`${BASE_CLASS} ${VARIANT_CLASS[variant]} ${className}`.trim()}
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
  const classes = `${BASE_CLASS} ${VARIANT_CLASS[variant]} ${className}`.trim();
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

"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import {
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";

export type AppButtonVariant = "primary" | "secondary" | "chip";

const VARIANT_CLASS: Record<AppButtonVariant, string> = {
  primary:
    "bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 focus-visible:outline-slate-900 disabled:bg-slate-400 disabled:text-white",
  secondary:
    "border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 focus-visible:outline-slate-700 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none",
  chip:
    "border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 underline decoration-slate-300 underline-offset-2 shadow-sm hover:border-slate-400 hover:bg-slate-50 hover:decoration-slate-600 active:bg-slate-100 focus-visible:outline-slate-700 disabled:border-slate-200 disabled:text-slate-400 disabled:no-underline",
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
            ? "inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            : "inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800"
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
          light={variant === "primary"}
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
      >
        {pending ? (
          <AppPendingIndicator
            label={pendingLabel ?? (typeof children === "string" ? children : "Working…")}
            light={variant === "primary"}
          />
        ) : (
          children
        )}
      </span>
    );
  }
  return (
    <Link href={href} className={classes} title={title} onClick={onClick}>
      {children}
    </Link>
  );
}

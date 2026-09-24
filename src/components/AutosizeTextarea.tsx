"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";

/** Textarea that grows with content so multiline values are fully visible. */
export function AutosizeTextarea({
  className,
  value,
  defaultValue,
  onChange,
  onInput,
  minRows = 3,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 20;
    const minHeight = lineHeight * minRows + 16;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [minRows]);

  useEffect(() => {
    resize();
  }, [value, defaultValue, resize]);

  return (
    <textarea
      {...rest}
      ref={ref}
      {...(value !== undefined ? { value } : { defaultValue })}
      rows={minRows}
      className={className}
      onChange={onChange}
      onInput={(event) => {
        resize();
        onInput?.(event);
      }}
    />
  );
}

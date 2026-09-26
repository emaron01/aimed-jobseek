"use client";

import { useEffect, useState } from "react";
import {
  DELETE_SUCCESS_NOTICE_EVENT,
  DELETE_SUCCESS_NOTICE_KEY,
} from "@/lib/tenant/delete-success-notice";

export {
  DELETE_SUCCESS_NOTICE_EVENT,
  DELETE_SUCCESS_NOTICE_KEY,
} from "@/lib/tenant/delete-success-notice";

/**
 * One-shot banner after a successful delete.
 * - Server redirect(): cookie set by the action
 * - Same-route client refresh: sessionStorage / custom event from ConfirmDeleteForm
 */
export function DeleteSuccessNotice() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const show = (text: string) => setMessage(text);

    try {
      const stored = sessionStorage.getItem(DELETE_SUCCESS_NOTICE_KEY);
      if (stored) {
        sessionStorage.removeItem(DELETE_SUCCESS_NOTICE_KEY);
        show(stored);
      }
    } catch {
      // sessionStorage may be unavailable
    }

    try {
      const match = document.cookie.match(
        new RegExp(
          `(?:^|; )${DELETE_SUCCESS_NOTICE_KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`,
        ),
      );
      if (match?.[1]) {
        const fromCookie = decodeURIComponent(match[1]);
        document.cookie = `${DELETE_SUCCESS_NOTICE_KEY}=; path=/; max-age=0`;
        if (fromCookie) show(fromCookie);
      }
    } catch {
      // ignore
    }

    const onNotice = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail) {
        try {
          sessionStorage.removeItem(DELETE_SUCCESS_NOTICE_KEY);
        } catch {
          // ignore
        }
        show(detail);
      }
    };

    window.addEventListener(DELETE_SUCCESS_NOTICE_EVENT, onNotice);
    return () =>
      window.removeEventListener(DELETE_SUCCESS_NOTICE_EVENT, onNotice);
  }, []);

  if (!message) return null;

  return (
    <p
      role="status"
      data-testid="delete-success-notice"
      className="mb-4 rounded-md border border-success bg-success-tint px-3 py-2 text-sm text-success"
    >
      {message}
    </p>
  );
}

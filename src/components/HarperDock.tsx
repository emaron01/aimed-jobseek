"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getHarperSuggestionsAction } from "@/app/actions/application-jobs";
import { ErrorState } from "@/components/design";
import { AppActionLink, AppButton } from "@/components/ui";
import { openWorkspaceSection } from "@/lib/application/workspace-links";
import {
  applicationStepCopy,
  consultationConfig,
  polishCopy,
  workspaceSectionId,
} from "@/lib/product-config";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 280;
const MAX_WIDTH = 560;
const DEFAULT_WIDTH = 360;
const STORAGE_OPEN = "application-harper-open";
const STORAGE_WIDTH = "application-harper-width";

export function HarperSuggestionList({
  campaignId,
}: {
  campaignId: string;
}) {
  const pathname = usePathname() || "";
  const [items, setItems] = useState<
    Array<{ type: string; label: string; href: string }>
  >([]);
  const [step, setStep] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getHarperSuggestionsAction(campaignId, pathname)
      .then((result) => {
        if (cancelled || !result) return;
        setItems(result.suggestions);
        setStep(result.step);
        setFailed(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setFailed(true);
        console.error(
          JSON.stringify({
            event: "harper_suggestions_client_failed",
            message: error instanceof Error ? error.message : "unknown",
          }),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, pathname]);

  if (failed) {
    return (
      <ErrorState
        description={polishCopy.harperSuggestionsFailed}
        onRetry={() => {
          setFailed(false);
          window.location.reload();
        }}
      />
    );
  }
  if (items.length === 0) return null;
  return (
    <div
      className="space-y-2"
      data-testid="harper-suggestions"
      data-step={step ?? ""}
    >
      {items.map((item) => (
        <AppActionLink
          key={`${item.type}:${item.href}`}
          href={item.href}
          variant="secondary"
          className="w-full !justify-start"
          onClick={() => {
            if (item.href.startsWith("#")) {
              openWorkspaceSection(item.href.slice(1));
            }
          }}
        >
          {item.label}
        </AppActionLink>
      ))}
    </div>
  );
}

export function HarperDock({
  campaignId,
  children,
}: {
  campaignId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setMobileOpen(true);
      window.localStorage.setItem(STORAGE_OPEN, "1");
    };
    window.addEventListener("harper-open", onOpen);
    return () => window.removeEventListener("harper-open", onOpen);
  }, []);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!drag.current) return;
      const next = drag.current.startWidth + (drag.current.startX - event.clientX);
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)));
    };
    const onUp = () => {
      if (!drag.current) return;
      window.localStorage.setItem(STORAGE_WIDTH, String(width));
      drag.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [width]);

  const toggleDesktop = () => {
    const next = !open;
    setOpen(next);
    window.localStorage.setItem(STORAGE_OPEN, next ? "1" : "0");
  };

  return (
    <>
      <AppButton
        type="button"
        className="fixed bottom-4 right-4 z-40 shadow-md md:hidden"
        data-testid="harper-mobile-open"
        onClick={() => setMobileOpen(true)}
      >
        {consultationConfig.displayName}
      </AppButton>
      <aside
        id={workspaceSectionId("CONSULTATION")}
        data-testid="harper-dock"
        className={cn(
          "relative flex h-full shrink-0 flex-col border-l border-edge bg-surface transition-[width] duration-200 ease-out motion-reduce:transition-none",
          mobileOpen
            ? "fixed inset-0 z-50"
            : open
              ? "hidden md:flex"
              : "hidden w-12 md:flex",
        )}
        style={!mobileOpen && open ? { width } : undefined}
      >
        {open && !mobileOpen ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={`${consultationConfig.displayName} width`}
            className="absolute inset-y-0 left-0 w-1.5 cursor-col-resize bg-transparent hover:bg-primary/30"
            onMouseDown={(event) => {
              drag.current = { startX: event.clientX, startWidth: width };
            }}
          />
        ) : null}
        <div className="flex items-center justify-between gap-2 border-b border-edge px-3 py-2">
          {open || mobileOpen ? (
            <p className="text-sm font-semibold text-ink">
              {consultationConfig.displayName}
            </p>
          ) : null}
          <AppButton
            type="button"
            variant="secondary"
            className="!px-2.5 !py-1"
            data-testid="harper-dock-toggle"
            onClick={() => {
              if (mobileOpen) {
                setMobileOpen(false);
                return;
              }
              toggleDesktop();
            }}
          >
            {open || mobileOpen
              ? applicationStepCopy.harperCollapse
              : applicationStepCopy.harperExpand}
          </AppButton>
        </div>
        {open || mobileOpen ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
            <HarperSuggestionList campaignId={campaignId} />
            {children}
          </div>
        ) : null}
      </aside>
    </>
  );
}

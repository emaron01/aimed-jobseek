"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppButton } from "@/components/AppButton";
import { PrintApplicationSummaryButton } from "@/components/PrintApplicationSummaryButton";
import {
  CHEAT_SHEET_HEADING_CLASS,
  cheatSheetScrollTarget,
  cheatSheetSectionIdsToOpen,
  initialCheatSheetOpenIds,
} from "@/lib/application-summary/cheat-sheet-collapse";

type CollapseApi = {
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
};

const CheatSheetCollapseContext = createContext<CollapseApi | null>(null);

export function useCheatSheetCollapse(): CollapseApi | null {
  return useContext(CheatSheetCollapseContext);
}

export function CheatSheetCollapseProvider({ children }: { children: ReactNode }) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => initialCheatSheetOpenIds());
  const pendingScroll = useRef<string | null>(null);

  useEffect(() => {
    function applyLocation() {
      const hash = window.location.hash;
      const person = new URLSearchParams(window.location.search).get("person");
      const ids = cheatSheetSectionIdsToOpen({ hash, personQuery: person });
      const target = cheatSheetScrollTarget({ hash, personQuery: person });
      if (ids.length === 0) return;
      pendingScroll.current = target;
      setOpenIds((current) => {
        const next = new Set(current);
        for (const id of ids) next.add(id);
        return next;
      });
    }
    applyLocation();
    window.addEventListener("hashchange", applyLocation);
    return () => window.removeEventListener("hashchange", applyLocation);
  }, []);

  useEffect(() => {
    const target = pendingScroll.current;
    if (!target) return;
    let attempts = 0;
    let timer = 0;
    const find = () => {
      const element = document.getElementById(target);
      if (element) {
        element.scrollIntoView({ block: "start" });
        pendingScroll.current = null;
        return;
      }
      attempts += 1;
      if (attempts > 20) return;
      timer = window.setTimeout(find, 50);
    };
    find();
    return () => window.clearTimeout(timer);
  }, [openIds]);

  const api = useMemo<CollapseApi>(
    () => ({
      isOpen: (id: string) => openIds.has(id),
      toggle: (id: string) => {
        setOpenIds((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      },
    }),
    [openIds],
  );

  return (
    <CheatSheetCollapseContext.Provider value={api}>
      {children}
    </CheatSheetCollapseContext.Provider>
  );
}

function HeadingButton({
  title,
  open,
  onToggle,
  testId,
  heading,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  testId: string;
  heading: "h2" | "h3";
}) {
  const Heading = heading;
  return (
    <AppButton
      type="button"
      variant="secondary"
      className={CHEAT_SHEET_HEADING_CLASS}
      aria-expanded={open}
      data-testid={testId}
      onClick={onToggle}
    >
      <Heading className="flex items-center gap-2 text-sm font-semibold text-primary">
        <span
          aria-hidden="true"
          className="inline-block text-primary"
          data-cheat-sheet-indicator={open ? "open" : "collapsed"}
        >
          {open ? "▼" : "▶"}
        </span>
        {title}
      </Heading>
    </AppButton>
  );
}

export function CheatSheetSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const collapse = useCheatSheetCollapse();
  const open = collapse ? collapse.isOpen(id) : false;
  return (
    <section
      id={id}
      data-print-id={id}
      data-cheat-sheet-section={id}
      data-cheat-sheet-open={open ? "true" : "false"}
      className="application-summary-section break-inside-avoid rounded-lg border border-edge bg-surface p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <HeadingButton
            title={title}
            open={open}
            heading="h2"
            testId={`cheat-sheet-toggle-${id}`}
            onToggle={() => collapse?.toggle(id)}
          />
        </div>
        <PrintApplicationSummaryButton sectionId={id} />
      </div>
      <div
        className={
          open
            ? "cheat-sheet-collapsible-body mt-4 space-y-4"
            : "cheat-sheet-collapsible-body hidden"
        }
        data-testid={`cheat-sheet-body-${id}`}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * Person subsections. Without the cheat-sheet provider (Harper), the heading
 * stays the existing static h3 and the body stays open.
 */
export function CheatSheetSubsection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const collapse = useCheatSheetCollapse();
  if (!collapse) {
    return (
      <div id={id}>
        <h3 className="font-medium text-ink">{title}</h3>
        <div className="mt-2">{children}</div>
      </div>
    );
  }
  const open = collapse.isOpen(id);
  return (
    <div
      id={id}
      data-cheat-sheet-section={id}
      data-cheat-sheet-open={open ? "true" : "false"}
    >
      <HeadingButton
        title={title}
        open={open}
        heading="h3"
        testId={`cheat-sheet-toggle-${id}`}
        onToggle={() => collapse.toggle(id)}
      />
      <div
        className={
          open
            ? "cheat-sheet-collapsible-body mt-3 space-y-3"
            : "cheat-sheet-collapsible-body hidden"
        }
      >
        {children}
      </div>
    </div>
  );
}

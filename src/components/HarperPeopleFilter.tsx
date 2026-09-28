"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppButton } from "@/components/AppButton";
import {
  matchCheatSheetFilterOptions,
  type CheatSheetFilterOption,
} from "@/lib/application-summary/filter";
import { harperContactAnchorId } from "@/lib/consultation/harper-layout";
import { applicationSummaryConfig } from "@/lib/product-config";

type HarperFilterState = {
  query: string;
  selectedKey: string | null;
  options: CheatSheetFilterOption[];
  setQuery: (query: string) => void;
  selectOption: (sectionKey: string) => void;
  clear: () => void;
};

const HarperFilterContext = createContext<HarperFilterState | null>(null);

function useHarperFilter(): HarperFilterState {
  const value = useContext(HarperFilterContext);
  if (!value) {
    throw new Error("Harper people filter is missing.");
  }
  return value;
}

function optionLabel(option: CheatSheetFilterOption): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const part of [option.heading, option.personaName, ...option.titles]) {
    const value = part.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(value);
  }
  return parts.join(" · ");
}

function contactIdFromSectionKey(sectionKey: string): string | null {
  const key = sectionKey.trim();
  if (!key.startsWith("contact:")) return null;
  const contactId = key.slice("contact:".length).trim();
  return contactId || null;
}

function sectionKeyFromHarperHash(hash: string): string | null {
  const raw = hash.replace(/^#/, "").trim();
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  if (!decoded.startsWith("harper-contact:")) return null;
  const contactId = decoded.slice("harper-contact:".length).trim();
  return contactId ? `contact:${contactId}` : null;
}

export function HarperFilterProvider({
  options,
  initialPersonKey = null,
  children,
}: {
  options: CheatSheetFilterOption[];
  /** From `?person=contact:{id}` so Edit/Answer links open the profile. */
  initialPersonKey?: string | null;
  children: ReactNode;
}) {
  const initialKey = (() => {
    const key = initialPersonKey?.trim() || null;
    if (!key) return null;
    return options.some((item) => item.sectionKey === key) ? key : null;
  })();
  const [query, setQuery] = useState(() => {
    if (!initialKey) return "";
    const option = options.find((item) => item.sectionKey === initialKey);
    return option ? optionLabel(option) : "";
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);

  const selectOption = useCallback(
    (sectionKey: string) => {
      const option = options.find((item) => item.sectionKey === sectionKey);
      if (!option) {
        throw new Error("That person is not on this Harper page.");
      }
      setSelectedKey(sectionKey);
      setQuery(optionLabel(option));
      const contactId = contactIdFromSectionKey(sectionKey);
      if (contactId && typeof window !== "undefined") {
        const hash = window.location.hash.replace(/^#/, "").trim();
        let decoded = hash;
        try {
          decoded = decodeURIComponent(hash);
        } catch {
          decoded = hash;
        }
        // Keep a question/coach fragment when deep-linking; otherwise select the contact.
        if (
          decoded.startsWith("harper-q:") ||
          decoded.startsWith("harper-coach:")
        ) {
          return;
        }
        const nextHash = `#${encodeURIComponent(harperContactAnchorId(contactId))}`;
        if (window.location.hash !== nextHash) {
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${window.location.search}${nextHash}`,
          );
        }
      }
    },
    [options],
  );

  const clear = useCallback(() => {
    setQuery("");
    setSelectedKey(null);
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  useEffect(() => {
    const scrollToHashTarget = () => {
      const raw = window.location.hash.replace(/^#/, "").trim();
      if (!raw) return;
      let decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
      } catch {
        decoded = raw;
      }
      let attempts = 0;
      const find = () => {
        const target = document.getElementById(decoded);
        if (target) {
          target.scrollIntoView({ block: "start" });
          return;
        }
        attempts += 1;
        if (attempts > 20) return;
        window.setTimeout(find, 50);
      };
      find();
    };

    const applyHash = () => {
      const key = sectionKeyFromHarperHash(window.location.hash);
      if (key) {
        const option = options.find((item) => item.sectionKey === key);
        if (option) {
          setSelectedKey(key);
          setQuery(optionLabel(option));
        }
      }
      scrollToHashTarget();
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [options]);

  // Deep link with ?person= + #harper-q / #harper-coach: scroll after profile mounts.
  useEffect(() => {
    if (!initialKey || !selectedKey) return;
    if (typeof window === "undefined") return;
    const raw = window.location.hash.replace(/^#/, "").trim();
    if (!raw) return;
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = raw;
    }
    if (
      !decoded.startsWith("harper-q:") &&
      !decoded.startsWith("harper-coach:")
    ) {
      return;
    }
    let attempts = 0;
    const find = () => {
      const target = document.getElementById(decoded);
      if (target) {
        target.scrollIntoView({ block: "start" });
        return;
      }
      attempts += 1;
      if (attempts > 20) return;
      window.setTimeout(find, 50);
    };
    find();
  }, [initialKey, selectedKey]);

  const value = useMemo<HarperFilterState>(
    () => ({
      query,
      selectedKey,
      options,
      setQuery: (next) => {
        setQuery(next);
        setSelectedKey(null);
      },
      selectOption,
      clear,
    }),
    [options, query, selectedKey, selectOption, clear],
  );

  return (
    <HarperFilterContext.Provider value={value}>
      {children}
    </HarperFilterContext.Provider>
  );
}

export function HarperPeopleFilter() {
  const { query, selectedKey, options, setQuery, selectOption, clear } =
    useHarperFilter();
  if (options.length === 0) return null;
  const matches = matchCheatSheetFilterOptions(options, selectedKey ? "" : query);
  return (
    <div className="space-y-2" data-testid="harper-people-filter">
      <label className="block text-sm">
        <span className="font-medium text-ink">
          {applicationSummaryConfig.actions.filterPeople}
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={applicationSummaryConfig.actions.filterPlaceholder}
          className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          data-testid="harper-people-filter-input"
          autoComplete="off"
        />
      </label>
      {selectedKey ? (
        <AppButton
          type="button"
          variant="secondary"
          onClick={clear}
          data-testid="harper-people-filter-clear"
        >
          {applicationSummaryConfig.actions.filterClear}
        </AppButton>
      ) : null}
      {!selectedKey && query.trim() ? (
        matches.length === 0 ? (
          <p className="text-sm text-muted" data-testid="harper-people-filter-empty">
            {applicationSummaryConfig.actions.filterNoMatches}
          </p>
        ) : (
          <ul
            className="space-y-1 rounded-md border border-edge bg-canvas p-2"
            data-testid="harper-people-filter-matches"
          >
            {matches.map((option) => (
              <li key={option.sectionKey}>
                <AppButton
                  type="button"
                  variant="secondary"
                  className="w-full !justify-start"
                  onClick={() => selectOption(option.sectionKey)}
                  data-testid={`harper-people-filter-match-${option.sectionKey}`}
                >
                  {optionLabel(option)}
                </AppButton>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

/** Where you stand + cards — visible when no person is selected. */
export function HarperStandingView({ children }: { children: ReactNode }) {
  const { selectedKey } = useHarperFilter();
  if (selectedKey) return null;
  return <div data-testid="harper-standing-view">{children}</div>;
}

/** Person inline profile — visible when that person (or any person) is selected. */
export function HarperPersonViewShell({
  sectionKey,
  children,
}: {
  sectionKey: string;
  children: ReactNode;
}) {
  const { selectedKey } = useHarperFilter();
  if (selectedKey !== sectionKey) return null;
  return <>{children}</>;
}

export function HarperSelectPersonLink({
  sectionKey,
  children,
  className,
  testId,
}: {
  sectionKey: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  const { selectOption } = useHarperFilter();
  return (
    <AppButton
      type="button"
      variant="secondary"
      className={className}
      data-testid={testId}
      onClick={() => selectOption(sectionKey)}
    >
      {children}
    </AppButton>
  );
}

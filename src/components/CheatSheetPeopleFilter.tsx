"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppButton } from "@/components/AppButton";
import { PrintApplicationSummaryButton } from "@/components/PrintApplicationSummaryButton";
import {
  cheatSheetPrintSectionId,
  matchCheatSheetFilterOptions,
  visibleCheatSheetSectionKeys,
  type CheatSheetFilterOption,
} from "@/lib/application-summary/filter";
import { applicationSummaryConfig } from "@/lib/product-config";

type FilterState = {
  query: string;
  selectedKey: string | null;
  options: CheatSheetFilterOption[];
  setQuery: (query: string) => void;
  selectOption: (sectionKey: string) => void;
  clear: () => void;
};

const CheatSheetFilterContext = createContext<FilterState | null>(null);

function useCheatSheetFilter(): FilterState {
  const value = useContext(CheatSheetFilterContext);
  if (!value) {
    throw new Error("Cheat sheet filter is missing.");
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

export function CheatSheetFilterProvider({
  options,
  children,
}: {
  options: CheatSheetFilterOption[];
  children: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const value = useMemo<FilterState>(
    () => ({
      query,
      selectedKey,
      options,
      setQuery: (next) => {
        setQuery(next);
        setSelectedKey(null);
      },
      selectOption: (sectionKey) => {
        const option = options.find((item) => item.sectionKey === sectionKey);
        if (!option) {
          throw new Error("That Interview cheat sheet section is not on this page.");
        }
        setSelectedKey(sectionKey);
        setQuery(optionLabel(option));
      },
      clear: () => {
        setQuery("");
        setSelectedKey(null);
      },
    }),
    [options, query, selectedKey],
  );
  return (
    <CheatSheetFilterContext.Provider value={value}>
      {children}
    </CheatSheetFilterContext.Provider>
  );
}

export function CheatSheetPrintButton() {
  const { selectedKey } = useCheatSheetFilter();
  return (
    <PrintApplicationSummaryButton
      sectionId={cheatSheetPrintSectionId(selectedKey)}
    />
  );
}

export function CheatSheetPeopleFilter() {
  const { query, selectedKey, options, setQuery, selectOption, clear } =
    useCheatSheetFilter();
  const matches = matchCheatSheetFilterOptions(options, selectedKey ? "" : query);
  return (
    <div className="print:hidden space-y-2" data-testid="cheat-sheet-filter">
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
          data-testid="cheat-sheet-filter-input"
          autoComplete="off"
        />
      </label>
      {selectedKey ? (
        <AppButton
          type="button"
          variant="secondary"
          onClick={clear}
          data-testid="cheat-sheet-filter-clear"
        >
          {applicationSummaryConfig.actions.filterClear}
        </AppButton>
      ) : null}
      {!selectedKey && query.trim() ? (
        matches.length === 0 ? (
          <p className="text-sm text-muted" data-testid="cheat-sheet-filter-empty">
            {applicationSummaryConfig.actions.filterNoMatches}
          </p>
        ) : (
          <ul
            className="space-y-1 rounded-md border border-edge bg-canvas p-2"
            data-testid="cheat-sheet-filter-matches"
          >
            {matches.map((option) => (
              <li key={option.sectionKey}>
                <AppButton
                  type="button"
                  variant="secondary"
                  className="w-full !justify-start"
                  onClick={() => selectOption(option.sectionKey)}
                  data-testid={`cheat-sheet-filter-match-${option.sectionKey}`}
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

export function CheatSheetPersonSection({
  sectionKey,
  children,
}: {
  sectionKey: string;
  children: ReactNode;
}) {
  const { selectedKey, options } = useCheatSheetFilter();
  const visible = visibleCheatSheetSectionKeys({
    sectionKeys: options.map((option) => option.sectionKey),
    selectedKey,
  });
  if (!visible.includes(sectionKey)) return null;
  return children;
}

export function CheatSheetSharedSection({ children }: { children: ReactNode }) {
  const { selectedKey } = useCheatSheetFilter();
  if (selectedKey) return null;
  return children;
}

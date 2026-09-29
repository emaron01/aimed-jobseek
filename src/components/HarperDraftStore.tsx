"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type HarperDraftContextValue = {
  getDraft: (key: string) => string;
  setDraft: (key: string, value: string) => void;
  clearDraft: (key: string) => void;
};

const HarperDraftContext = createContext<HarperDraftContextValue | null>(null);

/**
 * Page-lifetime unsaved answer drafts for Harper. Survives router.refresh and
 * busy-state UI because the provider stays mounted above question cards.
 */
export function HarperDraftProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const getDraft = useCallback((key: string) => drafts[key] ?? "", [drafts]);

  const setDraft = useCallback((key: string, value: string) => {
    setDrafts((current) => {
      if ((current[key] ?? "") === value) return current;
      return { ...current, [key]: value };
    });
  }, []);

  const clearDraft = useCallback((key: string) => {
    setDrafts((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ getDraft, setDraft, clearDraft }),
    [getDraft, setDraft, clearDraft],
  );

  return (
    <HarperDraftContext.Provider value={value}>
      {children}
    </HarperDraftContext.Provider>
  );
}

export function useHarperDraft(key: string): {
  value: string;
  setValue: (next: string) => void;
  clear: () => void;
} {
  const ctx = useContext(HarperDraftContext);
  if (!ctx) {
    throw new Error("useHarperDraft must be used within HarperDraftProvider");
  }
  return {
    value: ctx.getDraft(key),
    setValue: (next: string) => ctx.setDraft(key, next),
    clear: () => ctx.clearDraft(key),
  };
}

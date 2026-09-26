"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getHarperSuggestionsAction } from "@/app/actions/application-jobs";
import { ErrorState } from "@/components/design";
import { AppActionLink } from "@/components/ui";
import { polishCopy } from "@/lib/product-config";

export function HarperSuggestionList({ campaignId }: { campaignId: string }) {
  const pathname = usePathname() || "";
  const [items, setItems] = useState<
    Array<{ type: string; label: string; href: string }>
  >([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getHarperSuggestionsAction(campaignId, pathname)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setFailed(true);
          return;
        }
        setItems(result.suggestions);
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
    <div className="space-y-2" data-testid="harper-suggestions">
      {items.map((item) => (
        <AppActionLink
          key={`${item.type}:${item.href}`}
          href={item.href}
          variant="secondary"
          className="w-full !justify-start"
        >
          {item.label}
        </AppActionLink>
      ))}
    </div>
  );
}

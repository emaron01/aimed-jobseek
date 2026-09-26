"use client";
import { AppButton } from "@/components/ui";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CrudDeleteResult } from "@/lib/tenant/crud-delete";

type ArchiveAction = (
  prev: CrudDeleteResult | null,
  formData: FormData,
) => Promise<CrudDeleteResult>;

export function UnarchiveForm({
  action,
  idFieldName = "id",
  id,
  label,
}: {
  action: ArchiveAction;
  idFieldName?: string;
  id: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name={idFieldName} value={id} />
        <AppButton
          type="submit"
          disabled={pending}
          variant="secondary"
          data-testid="unarchive-submit"
        >
          {pending ? "Restoring…" : label}
        </AppButton>
      </form>
      {state && !state.ok ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="mt-2 text-sm text-success" role="status">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import {
  prepareResumeBulletCandidatesAction,
  saveResumeStatementPicksAction,
  type ApplicationAssetActionResult,
} from "@/app/actions/application-assets";
import type { StatementGroup } from "@/lib/application-assets/resume-statement-picks";
import { applicationAssetConfig } from "@/lib/product-config";

const initial: ApplicationAssetActionResult | null = null;

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

function StatementGroupFields({
  group,
  canEdit,
}: {
  group: StatementGroup;
  canEdit: boolean;
}) {
  const labels = applicationAssetConfig.labels;
  const [count, setCount] = useState(
    group.items.filter((item) => item.checked).length,
  );
  const outside =
    group.showRange && (count < group.minBullets || count > group.maxBullets);
  const rangeLabel = group.titleOnly
    ? labels.titleCompanyDatesOnly
    : fill(labels.recommendedBulletRange, {
        min: group.minBullets,
        max: group.maxBullets,
        count,
      });
  return (
    <fieldset className="space-y-2" data-testid={`statement-group-${group.id}`}>
      <legend className="text-sm font-semibold text-ink">{group.title}</legend>
      {group.showRange ? (
        <p className="text-xs text-subtle">{rangeLabel}</p>
      ) : null}
      {outside ? (
        <p className="text-sm text-muted" role="note">
          {fill(labels.picksOutsideRange, {
            count,
            min: group.minBullets,
            max: group.maxBullets,
          })}
        </p>
      ) : null}
      <ul className="space-y-2">
        {group.items.map((item) => (
          <li key={item.id}>
            <label className="flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="statementId"
                value={item.id}
                defaultChecked={item.checked}
                disabled={!canEdit}
                className="mt-1"
                onChange={(event) =>
                  setCount((current) => current + (event.target.checked ? 1 : -1))
                }
              />
              <span className="mt-0.5 block">{item.content}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export function ResumeStatementPicker({
  campaignId,
  groups,
  canEdit,
  needsPrepare,
}: {
  campaignId: string;
  groups: StatementGroup[];
  canEdit: boolean;
  needsPrepare: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveResumeStatementPicksAction,
    initial,
  );
  const [prepared, prepare, preparing] = useActionState(
    prepareResumeBulletCandidatesAction,
    initial,
  );
  const labels = applicationAssetConfig.labels;
  if (groups.length === 0 && !needsPrepare) return null;
  return (
    <div className="space-y-4" data-testid="harper-approved-statements">
      <h4 className="font-semibold text-ink">{labels.harperApprovedStatements}</h4>
      {needsPrepare && canEdit ? (
        <form action={prepare}>
          <input type="hidden" name="campaignId" value={campaignId} />
          <button
            type="submit"
            disabled={preparing}
            className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-on-ink disabled:opacity-60"
          >
            {labels.prepareResumeBullets}
          </button>
          {prepared ? (
            <p className={prepared.ok ? "mt-2 text-sm text-success" : "mt-2 text-sm text-danger"} role="status">
              {prepared.message}
            </p>
          ) : null}
        </form>
      ) : null}
      {groups.length === 0 ? null : (
    <form action={action} className="space-y-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      {groups.map((group) => (
        <StatementGroupFields key={group.id} group={group} canEdit={canEdit} />
      ))}
      {canEdit ? (
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-on-ink disabled:opacity-60"
        >
          {labels.saveStatementPicks}
        </button>
      ) : null}
      {state ? (
        <p className={state.ok ? "text-sm text-success" : "text-sm text-danger"} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
      )}
    </div>
  );
}

"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  prepareResumeBulletCandidatesAction,
  saveBulletEvidenceRoleAction,
  saveResumeStatementPicksAction,
  type ApplicationAssetActionResult,
} from "@/app/actions/application-assets";
import { AppPendingIndicator } from "@/components/AppButton";
import {
  GENERAL_BACKGROUND_ID,
  GENERAL_BACKGROUND_TITLE,
  type StatementGroup,
} from "@/lib/application-assets/resume-statement-picks";
import { applicationAssetConfig } from "@/lib/product-config";

const initial: ApplicationAssetActionResult | null = null;

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

function StatementGroupFields({
  campaignId,
  group,
  canEdit,
  roleOptions,
}: {
  campaignId: string;
  group: StatementGroup;
  canEdit: boolean;
  roleOptions: Array<{ roleId: string; label: string }>;
}) {
  const [moving, startMove] = useTransition();
  const labels = applicationAssetConfig.labels;
  const rangeLabel = group.titleOnly
    ? labels.titleCompanyDatesOnly
    : fill(labels.recommendedBulletRange, {
        min: group.minBullets,
        max: group.maxBullets,
      });
  return (
    <fieldset className="space-y-2" data-testid={`statement-group-${group.id}`}>
      <legend className="text-sm font-semibold text-ink">{group.title}</legend>
      {group.showRange ? (
        <p className="text-xs text-subtle">{rangeLabel}</p>
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
              />
              <span className="mt-0.5 block">
                {item.content}
                {canEdit && item.evidenceIds.length > 0 ? (
                  <select
                    aria-label="Job"
                    className="mt-1 block max-w-full rounded border border-edge bg-warning-tint px-1 py-0.5 text-xs text-subtle"
                    value={group.roleId ?? GENERAL_BACKGROUND_ID}
                    disabled={moving}
                    onChange={(event) => {
                      const roleId = event.target.value;
                      startMove(() => {
                        void saveBulletEvidenceRoleAction({
                          campaignId,
                          evidenceIds: item.evidenceIds,
                          roleId,
                        });
                      });
                    }}
                  >
                    {roleOptions.map((role) => (
                      <option key={role.roleId} value={role.roleId}>
                        {role.label}
                      </option>
                    ))}
                    <option value={GENERAL_BACKGROUND_ID}>{GENERAL_BACKGROUND_TITLE}</option>
                  </select>
                ) : null}
              </span>
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
  preparingBullets = false,
  roleOptions = [],
}: {
  campaignId: string;
  groups: StatementGroup[];
  canEdit: boolean;
  needsPrepare: boolean;
  /** True while Generate is preparing bullets before the resume job starts. */
  preparingBullets?: boolean;
  roleOptions?: Array<{ roleId: string; label: string }>;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    saveResumeStatementPicksAction,
    initial,
  );
  const [prepared, prepare, preparing] = useActionState(
    prepareResumeBulletCandidatesAction,
    initial,
  );
  const prepareWasPending = useRef(false);
  useEffect(() => {
    if (preparing) {
      prepareWasPending.current = true;
      return;
    }
    if (!prepareWasPending.current) return;
    prepareWasPending.current = false;
    if (prepared?.ok) router.refresh();
  }, [preparing, prepared, router]);
  const labels = applicationAssetConfig.labels;
  const bulletsPreparing = preparing || preparingBullets;
  if (groups.length === 0 && !needsPrepare && !bulletsPreparing) return null;
  return (
    <div className="space-y-4" data-testid="harper-approved-statements">
      <h4 className="font-semibold text-ink">{labels.harperApprovedStatements}</h4>
      {bulletsPreparing ? (
        <p className="text-sm text-ink" role="status" data-testid="resume-bullets-preparing">
          <AppPendingIndicator label={labels.preparingResumeBullets} />
        </p>
      ) : null}
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
        <StatementGroupFields
          key={group.id}
          campaignId={campaignId}
          group={group}
          canEdit={canEdit}
          roleOptions={roleOptions}
        />
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

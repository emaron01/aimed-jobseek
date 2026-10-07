"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addSeekerBulletAction,
  prepareResumeBulletCandidatesAction,
  saveBulletEvidenceRoleAction,
  removePickerBulletAction,
  saveBulletTextAction,
  saveResumeRoleVisibilityAction,
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

let focusBulletId: string | null = null;

function BulletLine({
  campaignId,
  item,
  groupRoleId,
  canEdit,
  roleOptions,
  moving,
  startMove,
}: {
  campaignId: string;
  item: StatementGroup["items"][number];
  groupRoleId: string | null;
  canEdit: boolean;
  roleOptions: Array<{ roleId: string; label: string }>;
  moving: boolean;
  startMove: (callback: () => void) => void;
}) {
  const router = useRouter();
  const labels = applicationAssetConfig.labels;
  const rowRef = useRef<HTMLLIElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.content);
  const [saving, startSave] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (focusBulletId !== item.id) return;
    focusBulletId = null;
    rowRef.current?.focus({ preventScroll: true });
  }, [item.id, item.content]);
  return (
    <li id={`bullet-row-${item.id}`} ref={rowRef} tabIndex={-1} className="text-sm text-ink">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          name="statementId"
          value={item.id}
          defaultChecked={item.checked}
          disabled={!canEdit}
          className="mt-1"
          onChange={(event) => {
            if (!item.needsJobCheck || !event.target.checked) return;
            void saveBulletEvidenceRoleAction({
              campaignId,
              bulletId: item.id,
              roleId: groupRoleId ?? GENERAL_BACKGROUND_ID,
              pick: true,
            }).then(() => router.refresh());
          }}
        />
        <span className="mt-0.5 block">
          {editing ? draft : item.content}
          {item.recommended ? (
            <span
              className="ml-2 inline-block rounded border border-edge px-1 align-middle text-xs text-subtle"
              data-testid="harper-recommends"
            >
              {labels.harperRecommends}
            </span>
          ) : null}
          {item.needsJobCheck ? (
            <span
              className="ml-2 inline-block rounded border border-edge px-1 align-middle text-xs text-subtle"
              data-testid="check-the-job"
            >
              {labels.checkTheJob}
            </span>
          ) : null}
        </span>
      </label>
      <span className="mt-1 flex flex-wrap items-center gap-2" data-testid={`bullet-actions-${item.id}`}>
        {canEdit && item.evidenceIds.length > 0 ? (
          <select
            aria-label="Job"
            className="max-w-full rounded border border-edge bg-warning-tint px-1 py-0.5 text-xs text-subtle"
            value={groupRoleId ?? GENERAL_BACKGROUND_ID}
            disabled={moving}
            onChange={(event) => {
              const roleId = event.target.value;
              startMove(() => {
                void saveBulletEvidenceRoleAction({
                  campaignId,
                  bulletId: item.id,
                  roleId,
                }).then(() => router.refresh());
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
        {canEdit ? (
          <button
            type="button"
            className="rounded border border-edge px-2 py-0.5 text-xs text-ink"
            onClick={() => {
              setDraft(editing ? draft : item.content);
              setEditing(true);
              rowRef.current?.focus({ preventScroll: true });
            }}
          >
            {labels.editBullet}
          </button>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            className="rounded border border-edge px-2 py-0.5 text-xs text-ink disabled:opacity-60"
            disabled={!editing || saving}
            onClick={() => {
              startSave(async () => {
                const result = await saveBulletTextAction({
                  campaignId,
                  bulletId: item.id,
                  text: draft,
                });
                if (!result.ok) {
                  setNote(result.message);
                  rowRef.current?.focus({ preventScroll: true });
                  return;
                }
                setNote(null);
                setEditing(false);
                focusBulletId = item.id;
                rowRef.current?.focus({ preventScroll: true });
                router.refresh();
              });
            }}
          >
            {labels.saveBullet}
          </button>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            className="rounded border border-edge px-2 py-0.5 text-xs text-ink disabled:opacity-60"
            disabled={saving}
            data-testid="remove-bullet"
            onClick={() => {
              startSave(async () => {
                const result = await removePickerBulletAction({
                  campaignId,
                  bulletId: item.id,
                });
                if (!result.ok) {
                  setNote(result.message);
                  rowRef.current?.focus({ preventScroll: true });
                  return;
                }
                router.refresh();
              });
            }}
          >
            {labels.removeBullet}
          </button>
        ) : null}
      </span>
      {editing ? (
        <textarea
          className="mt-1 block w-full rounded border border-edge px-2 py-1 text-sm text-ink"
          value={draft}
          aria-label={labels.editBullet}
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : null}
      {note ? (
        <p className="mt-1 text-xs text-danger" role="status">
          {note}
        </p>
      ) : null}
    </li>
  );
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
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, startSave] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <fieldset className="space-y-2" data-testid={`statement-group-${group.id}`}>
      <legend className="text-sm font-semibold text-ink">{group.title}</legend>
      {group.showRange ? (
        <p className="text-xs text-subtle">{rangeLabel}</p>
      ) : null}
      {canEdit && group.roleId ? (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            role="switch"
            checked={group.leftOff}
            data-testid="leave-off-resume"
            onChange={(event) => {
              const leftOff = event.target.checked;
              void saveResumeRoleVisibilityAction({
                campaignId,
                roleId: group.roleId ?? "",
                leftOff,
              }).then(() => router.refresh());
            }}
          />
          {labels.leaveOffResume}
        </label>
      ) : null}
      <ul className="space-y-2">
        {group.items.map((item) => (
          <BulletLine
            key={item.id}
            campaignId={campaignId}
            item={item}
            groupRoleId={group.roleId}
            canEdit={canEdit}
            roleOptions={roleOptions}
            moving={moving}
            startMove={startMove}
          />
        ))}
      </ul>
      {canEdit && group.roleId ? (
        adding ? (
          <div className="space-y-1">
            <textarea
              className="block w-full rounded border border-edge px-2 py-1 text-sm text-ink"
              aria-label={labels.addBullet}
              value={draft}
              rows={2}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              type="button"
              className="rounded border border-edge px-2 py-0.5 text-xs text-ink disabled:opacity-60"
              disabled={saving || !draft.trim()}
              onClick={() => {
                startSave(async () => {
                  const result = await addSeekerBulletAction({
                    campaignId,
                    roleId: group.roleId ?? "",
                    text: draft,
                  });
                  if (!result.ok || !result.bulletId) {
                    setNote(result.message);
                    return;
                  }
                  setNote(null);
                  setDraft("");
                  setAdding(false);
                  focusBulletId = result.bulletId;
                  router.refresh();
                });
              }}
            >
              {labels.saveBullet}
            </button>
            {note ? (
              <p className="text-xs text-danger" role="status">
                {note}
              </p>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            className="rounded border border-edge px-2 py-0.5 text-xs text-ink"
            data-testid="add-a-bullet"
            onClick={() => setAdding(true)}
          >
            {labels.addBullet}
          </button>
        )
      ) : null}
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
      {canEdit && (needsPrepare || groups.length > 0) ? (
        <form action={prepare}>
          <input type="hidden" name="campaignId" value={campaignId} />
          <button
            type="submit"
            disabled={preparing}
            className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-on-ink disabled:opacity-60"
          >
            {labels.refreshBullets}
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

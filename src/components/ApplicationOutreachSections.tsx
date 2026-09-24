"use client";

import { useActionState, useMemo, useState } from "react";
import {
  addApplicationContactAction,
  generateOutreachAssetAction,
  markApplicationAppliedAction,
  setApplicationProgressAction,
  markOutreachSentAction,
  updateApplicationContactRoleAction,
  type ApplicationOutreachActionResult,
} from "@/app/actions/application-outreach";
import { interviewConfig } from "@/lib/product-config";
import {
  applicationAssetContentSchema,
  composeOutreachText,
  type ApplicationAssetContent,
} from "@/lib/application-assets/contract";
import { outreachEmailHandoff } from "@/lib/application-assets/handoff";
import { openEmailClientHref } from "@/lib/email-generation/email-body";
import {
  outreachConfig,
  vocab,
} from "@/lib/product-config";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, SubmitButton } from "@/components/ui";

const initial: ApplicationOutreachActionResult | null = null;

type RoleOption = { id: string; name: string; suggestionKey: string | null };

type ContactRow = {
  contactId: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  personaId: string | null;
  personaName: string | null;
  roleConfirmed: boolean;
};

type OutreachRow = {
  id: string;
  type: "EMAIL" | "LINKEDIN_CONNECTION_NOTE" | "LINKEDIN_INMAIL";
  version: number;
  status: "DRAFT" | "APPROVED";
  personaId: string | null;
  contactId: string | null;
  purpose: "PROACTIVE" | "FOLLOW_UP" | "THANK_YOU" | "CHECK_IN" | null;
  sentAt: string | null;
  emailLength: "SHORT" | "MEDIUM" | "LONG" | null;
  content: unknown;
};

function Status({ result }: { result: ApplicationOutreachActionResult | null }) {
  if (!result) return null;
  return (
    <div
      role="status"
      className={result.ok ? "text-sm text-emerald-700" : "text-sm text-red-700"}
    >
      <p>{result.message}</p>
      {result.violations?.length ? (
        <ul className="mt-1 list-disc pl-5">
          {result.violations.map((violation) => (
            <li key={violation}>{violation}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function todayInputValue(value?: string | null): string {
  if (value) return value.slice(0, 10);
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function ApplicationAppliedSection({
  campaignId,
  canEdit,
  appliedAt,
  applicationProgress,
}: {
  campaignId: string;
  canEdit: boolean;
  appliedAt: string | null;
  applicationProgress: keyof typeof interviewConfig.progress | null;
}) {
  const [state, action] = useActionState(markApplicationAppliedAction, initial);
  const [progressState, progressAction] = useActionState(
    setApplicationProgressAction,
    initial,
  );
  return (
    <section
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-5"
      data-testid="application-applied"
    >
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          {outreachConfig.labels.appliedTitle}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{outreachConfig.labels.appliedHelp}</p>
      </div>
      <p className="text-sm font-medium text-slate-900" data-testid="application-status">
        {applicationProgress
          ? interviewConfig.progress[applicationProgress]
          : appliedAt
            ? `${outreachConfig.labels.appliedStatus} ${todayInputValue(appliedAt)}`
            : outreachConfig.labels.notAppliedStatus}
      </p>
      {canEdit ? (
        <form action={action} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="campaignId" value={campaignId} />
          <label className="text-sm">
            <span className="font-medium text-slate-700">Date</span>
            <input
              type="date"
              name="appliedAt"
              defaultValue={todayInputValue(appliedAt)}
              className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <SubmitButton>{outreachConfig.labels.appliedStatus}</SubmitButton>
        </form>
      ) : null}
      {canEdit ? (
        <form action={progressAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="campaignId" value={campaignId} />
          <label className="text-sm">
            <span className="font-medium text-slate-700">
              {interviewConfig.labels.progressTitle}
            </span>
            <select
              name="progress"
              defaultValue={applicationProgress ?? ""}
              className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {Object.entries(interviewConfig.progress).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton>{interviewConfig.labels.progressTitle}</SubmitButton>
        </form>
      ) : null}
      <Status result={state} />
      <Status result={progressState} />
    </section>
  );
}

export function ApplicationContactsSection({
  campaignId,
  canEdit,
  roles,
  contacts,
}: {
  campaignId: string;
  canEdit: boolean;
  roles: RoleOption[];
  contacts: ContactRow[];
}) {
  const [addState, addAction] = useActionState(addApplicationContactAction, initial);
  const [roleState, roleAction] = useActionState(
    updateApplicationContactRoleAction,
    initial,
  );
  return (
    <section
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
      data-testid="application-contacts"
    >
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          {outreachConfig.labels.contactsTitle}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{outreachConfig.labels.contactsHelp}</p>
      </div>
      {contacts.length === 0 ? (
        <p className="text-sm text-slate-600">No contacts on this {vocab.campaign.singular} yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {contacts.map((contact) => (
            <li key={contact.contactId} className="py-3 text-sm">
              <p className="font-medium text-slate-900">
                {[contact.firstName, contact.lastName].filter(Boolean).join(" ")}
              </p>
              <p className="text-slate-600">
                {contact.title ?? "—"}
                {contact.email ? ` · ${contact.email}` : ""}
              </p>
              {canEdit ? (
                <form action={roleAction} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="campaignId" value={campaignId} />
                  <input type="hidden" name="contactId" value={contact.contactId} />
                  <label className="text-sm">
                    <span className="font-medium text-slate-700">{vocab.persona.Singular}</span>
                    <select
                      name="personaId"
                      defaultValue={contact.personaId ?? ""}
                      className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="" disabled>
                        Choose {vocab.persona.aSingular}
                      </option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SubmitButton>Save role</SubmitButton>
                </form>
              ) : (
                <p className="mt-1 text-slate-600">{contact.personaName ?? "No role matched"}</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {contact.roleConfirmed
                  ? outreachConfig.labels.roleConfirmed
                  : outreachConfig.labels.roleUnconfirmed}
              </p>
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <form action={addAction} className="grid gap-3 md:grid-cols-2" data-testid="add-application-contact">
          <input type="hidden" name="campaignId" value={campaignId} />
          <label className="text-sm">
            <span className="font-medium text-slate-700">First name</span>
            <input name="firstName" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-700">Last name</span>
            <input name="lastName" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-700">Title</span>
            <input name="title" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-700">Email</span>
            <input name="email" type="email" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="font-medium text-slate-700">LinkedIn URL</span>
            <input name="linkedinUrl" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="font-medium text-slate-700">{vocab.persona.Singular} override</span>
            <select name="personaId" defaultValue="" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="">Match from title</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton>Add {vocab.contact.singular}</SubmitButton>
        </form>
      ) : null}
      <Status result={addState} />
      <Status result={roleState} />
    </section>
  );
}

function parsedContent(value: unknown): ApplicationAssetContent | null {
  const parsed = applicationAssetContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function ApplicationOutreachSection({
  campaignId,
  canEdit,
  roles,
  contacts,
  assets,
  approvedResumeId,
}: {
  campaignId: string;
  canEdit: boolean;
  roles: RoleOption[];
  contacts: ContactRow[];
  assets: OutreachRow[];
  approvedResumeId: string | null;
}) {
  const [generateState, generateAction] = useActionState(
    generateOutreachAssetAction,
    initial,
  );
  const [sentState, sentAction] = useActionState(markOutreachSentAction, initial);
  const sentAssets = assets.filter((asset) => asset.sentAt);
  const latestByGroup = useMemo(() => {
    const map = new Map<string, OutreachRow>();
    for (const asset of assets) {
      const key = `${asset.type}:${asset.personaId ?? ""}:${asset.contactId ?? ""}:${asset.purpose ?? ""}`;
      const existing = map.get(key);
      if (!existing || existing.version < asset.version) map.set(key, asset);
    }
    return [...map.values()];
  }, [assets]);

  return (
    <section
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
      data-testid="application-outreach"
    >
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          {outreachConfig.labels.sectionTitle}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{outreachConfig.labels.sectionHelp}</p>
      </div>
      {canEdit ? (
        <form action={generateAction} className="grid gap-3 md:grid-cols-2" data-testid="generate-outreach">
          <input type="hidden" name="campaignId" value={campaignId} />
          <label className="text-sm">
            <span className="font-medium text-slate-700">Channel</span>
            <select name="type" defaultValue="EMAIL" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="EMAIL">Email</option>
              <option value="LINKEDIN_CONNECTION_NOTE">LinkedIn connection note</option>
              <option value="LINKEDIN_INMAIL">LinkedIn InMail</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-700">{vocab.persona.Singular}</span>
            <select name="personaId" required defaultValue={roles[0]?.id ?? ""} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-700">{vocab.contact.Singular}</span>
            <select name="contactId" defaultValue="" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="">{outreachConfig.labels.noContact}</option>
              {contacts.map((contact) => (
                <option key={contact.contactId} value={contact.contactId}>
                  {[contact.firstName, contact.lastName].filter(Boolean).join(" ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-700">Purpose</span>
            <select name="purpose" defaultValue="PROACTIVE" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="PROACTIVE">{outreachConfig.labels.purposeProactive}</option>
              <option value="FOLLOW_UP">{outreachConfig.labels.purposeFollowUp}</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-700">Follow-up to</span>
            <select name="followUpToAssetId" defaultValue="" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="">None</option>
              {sentAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.type} v{asset.version}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-700">Email length</span>
            <select name="emailLength" defaultValue="MEDIUM" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="SHORT">Short</option>
              <option value="MEDIUM">Medium</option>
              <option value="LONG">Long</option>
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            <span className="font-medium text-slate-700">{outreachConfig.labels.changeInstruction}</span>
            <textarea
              name="regenerationInstruction"
              rows={2}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <SubmitButton>{outreachConfig.labels.generate}</SubmitButton>
        </form>
      ) : null}
      <Status result={generateState} />
      <div className="space-y-4">
        {latestByGroup.map((asset) => (
          <OutreachMessageCard
            key={asset.id}
            campaignId={campaignId}
            canEdit={canEdit}
            asset={asset}
            contacts={contacts}
            approvedResumeId={approvedResumeId}
            sentAction={sentAction}
          />
        ))}
      </div>
      <Status result={sentState} />
    </section>
  );
}

function OutreachMessageCard({
  campaignId,
  canEdit,
  asset,
  contacts,
  approvedResumeId,
  sentAction,
}: {
  campaignId: string;
  canEdit: boolean;
  asset: OutreachRow;
  contacts: ContactRow[];
  approvedResumeId: string | null;
  sentAction: (formData: FormData) => void;
}) {
  const content = parsedContent(asset.content);
  const composed = content ? composeOutreachText(content) : null;
  const contact = contacts.find((row) => row.contactId === asset.contactId) ?? null;
  const [copied, setCopied] = useState<string | null>(null);
  const handoff = composed
    ? outreachEmailHandoff({
        to: contact?.email ?? "",
        subject: composed.subject ?? "",
        body: composed.body,
      })
    : null;

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
  }

  return (
    <article className="space-y-3 rounded-md border border-slate-200 p-4" data-testid="outreach-message">
      <p className="text-sm font-medium text-slate-900">
        {asset.type} · v{asset.version}
        {asset.sentAt ? ` · ${outreachConfig.labels.sentStatus} ${todayInputValue(asset.sentAt)}` : ""}
      </p>
      {composed ? (
        <div className="space-y-2 text-sm text-slate-800">
          {composed.subject ? <p><span className="font-medium">Subject:</span> {composed.subject}</p> : null}
          <pre className="whitespace-pre-wrap font-sans">{composed.body}</pre>
        </div>
      ) : (
        <p className="text-sm text-red-700">This message could not be displayed.</p>
      )}
      {canEdit && composed && asset.type === "EMAIL" && handoff ? (
        <div className="flex flex-wrap gap-2" data-testid="email-handoff">
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            onClick={() => handoff.outlookWeb.href && openEmailClientHref(handoff.outlookWeb.href)}
          >
            {outreachConfig.labels.openOutlookWeb}
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            onClick={() => openEmailClientHref(handoff.outlookDesktop.href)}
          >
            {outreachConfig.labels.openOutlookDesktop}
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            onClick={() => handoff.gmailWeb.href && openEmailClientHref(handoff.gmailWeb.href)}
          >
            {outreachConfig.labels.openGmail}
          </button>
          {approvedResumeId ? (
            <a
              href={`/api/application-assets/${approvedResumeId}/docx`}
              className={SECONDARY_BUTTON_CLASS}
            >
              {outreachConfig.labels.downloadResume}
            </a>
          ) : null}
          <p className="w-full text-xs text-slate-600">{outreachConfig.labels.attachResumeReminder}</p>
        </div>
      ) : null}
      {canEdit && composed && asset.type !== "EMAIL" ? (
        <div className="flex flex-wrap gap-2" data-testid="linkedin-handoff">
          {composed.subject ? (
            <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => copy("subject", composed.subject ?? "")}>
              {outreachConfig.labels.copySubject}
            </button>
          ) : null}
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => copy("body", composed.body)}>
            {outreachConfig.labels.copyBody}
          </button>
          {contact?.linkedinUrl ? (
            <a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className={SECONDARY_BUTTON_CLASS}>
              {outreachConfig.labels.openLinkedIn}
            </a>
          ) : null}
          {copied ? <span className="text-xs text-emerald-700">Copied {copied}.</span> : null}
        </div>
      ) : null}
      {canEdit && !asset.sentAt ? (
        <form action={sentAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="assetId" value={asset.id} />
          <label className="text-sm">
            <span className="font-medium text-slate-700">Sent date</span>
            <input
              type="date"
              name="sentAt"
              defaultValue={todayInputValue()}
              className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <SubmitButton>{outreachConfig.labels.markSent}</SubmitButton>
        </form>
      ) : null}
    </article>
  );
}

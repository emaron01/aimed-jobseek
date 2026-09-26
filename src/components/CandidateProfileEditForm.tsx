"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveCandidateProfileAction,
  type CandidateProfileActionResult,
} from "@/app/actions/candidate-profile";
import { AppButton } from "@/components/AppButton";
import { AutosizeTextarea } from "@/components/AutosizeTextarea";
import { SubmitButton } from "@/components/ui";
import { candidateProfileEditCopy } from "@/lib/product-config";
import {
  emptyCandidateProfile,
  parseCandidateProfileSafe,
  type CandidateProfile,
  type ProfileExperienceRole,
  type ProfileFactItem,
} from "@/lib/product-research/candidate-profile";

const initial: CandidateProfileActionResult | null = null;

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function seekerFact(id: string, text: string): ProfileFactItem | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return {
    id,
    kind: "FACT",
    text: trimmed,
    provenance: [{ sourceId: "pending-user-confirmation" }],
  };
}

function seekerFacts(idPrefix: string, value: string): ProfileFactItem[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: `${idPrefix}_${index + 1}`,
      kind: "FACT" as const,
      text,
      provenance: [{ sourceId: "pending-user-confirmation" }],
    }));
}

function emptyRole(): ProfileExperienceRole {
  return {
    id: newId("role"),
    kind: "FACT",
    employer: null,
    title: null,
    startDate: null,
    endDate: null,
    location: null,
    summary: null,
    achievements: [],
    reasonForLeaving: null,
    provenance: [{ sourceId: "pending-user-confirmation" }],
  };
}

function moveItem<T>(items: T[], index: number, offset: number): T[] {
  const next = index + offset;
  if (next < 0 || next >= items.length) return items;
  const copy = [...items];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}

function Field({
  label,
  hint,
  value,
  onChange,
  singleLine = false,
  optional = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  singleLine?: boolean;
  optional?: boolean;
}) {
  const shared =
    "mt-1 w-full rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm text-ink outline-none ring-focus focus:ring-2";
  return (
    <label className="block text-sm">
      <span className="font-medium text-ink">
        {label}
        {optional ? " (optional)" : ""}
      </span>
      {hint ? <span className="mt-0.5 block text-xs text-subtle">{hint}</span> : null}
      {singleLine ? (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={shared}
        />
      ) : (
        <AutosizeTextarea
          value={value}
          minRows={2}
          onChange={(event) => onChange(event.target.value)}
          className={`${shared} resize-none overflow-hidden`}
        />
      )}
    </label>
  );
}

export function CandidateProfileEditForm({
  productId,
  profileJson,
}: {
  productId: string;
  profileJson: unknown;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    saveCandidateProfileAction,
    initial,
  );
  const parsed = parseCandidateProfileSafe(profileJson);
  const initialProfile = parsed.ok ? parsed.profile : emptyCandidateProfile();
  const [profile, setProfile] = useState<CandidateProfile>(initialProfile);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  function setIdentity(
    key: keyof CandidateProfile["identity"],
    id: string,
    value: string,
  ) {
    setProfile((current) => ({
      ...current,
      identity: {
        ...current.identity,
        [key]: seekerFact(current.identity[key]?.id ?? id, value),
      },
    }));
  }

  function setDirectionList(
    key: "targetTitles" | "functions" | "careerGoals",
    idPrefix: string,
    value: string,
  ) {
    setProfile((current) => ({
      ...current,
      direction: {
        ...current.direction,
        [key]: seekerFacts(idPrefix, value),
      },
    }));
  }

  function updateRole(
    index: number,
    patch: Partial<ProfileExperienceRole>,
  ) {
    setProfile((current) => ({
      ...current,
      experience: current.experience.map((role, roleIndex) =>
        roleIndex === index ? { ...role, ...patch } : role,
      ),
    }));
  }

  return (
    <form
      action={formAction}
      className="space-y-8"
      data-testid="candidate-profile-edit-form"
    >
      <input type="hidden" name="productId" value={productId} />
      <input
        type="hidden"
        name="candidateProfileJson"
        value={JSON.stringify(profile)}
      />
      {state ? (
        <p
          role="status"
          data-testid="candidate-profile-edit-status"
          className={state.ok ? "text-sm text-success" : "text-sm text-danger"}
        >
          {state.message}
        </p>
      ) : null}

      <section className="space-y-4" data-testid="profile-edit-identity">
        <h2 className="text-base font-semibold text-ink">
          {candidateProfileEditCopy.identityTitle}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label={candidateProfileEditCopy.fullName}
            value={profile.identity.name?.text ?? ""}
            onChange={(value) => setIdentity("name", "id_name", value)}
            singleLine
          />
          <Field
            label={candidateProfileEditCopy.headline}
            value={profile.identity.headline?.text ?? ""}
            onChange={(value) => setIdentity("headline", "id_headline", value)}
            singleLine
          />
          <Field
            label={candidateProfileEditCopy.cityState}
            value={profile.identity.cityState?.text ?? ""}
            onChange={(value) => setIdentity("cityState", "id_city_state", value)}
            singleLine
          />
          <Field
            label={candidateProfileEditCopy.phone}
            value={profile.identity.phone?.text ?? ""}
            onChange={(value) => setIdentity("phone", "id_phone", value)}
            singleLine
          />
          <Field
            label={candidateProfileEditCopy.email}
            value={profile.identity.email?.text ?? ""}
            onChange={(value) => setIdentity("email", "id_email", value)}
            singleLine
          />
          <Field
            label={candidateProfileEditCopy.linkedinUrl}
            hint={candidateProfileEditCopy.linkedinHint}
            value={profile.identity.linkedinUrl?.text ?? ""}
            onChange={(value) =>
              setIdentity("linkedinUrl", "id_linkedin_url", value)
            }
            singleLine
            optional
          />
          <Field
            label={candidateProfileEditCopy.personalWebsite}
            hint={candidateProfileEditCopy.personalWebsiteHint}
            value={profile.identity.personalSite?.text ?? ""}
            onChange={(value) =>
              setIdentity("personalSite", "id_personal_site", value)
            }
            singleLine
            optional
          />
        </div>
      </section>

      <section className="space-y-4" data-testid="profile-edit-direction">
        <h2 className="text-base font-semibold text-ink">
          {candidateProfileEditCopy.directionTitle}
        </h2>
        <Field
          label={candidateProfileEditCopy.positioning}
          value={profile.positioning?.text ?? ""}
          onChange={(value) =>
            setProfile((current) => ({
              ...current,
              positioning: seekerFact(
                current.positioning?.id ?? "id_positioning",
                value,
              ),
            }))
          }
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label={candidateProfileEditCopy.targetTitles}
            hint={candidateProfileEditCopy.onePerLine}
            value={profile.direction.targetTitles.map((item) => item.text).join("\n")}
            onChange={(value) => setDirectionList("targetTitles", "id_title", value)}
          />
          <Field
            label={candidateProfileEditCopy.functions}
            hint={candidateProfileEditCopy.onePerLine}
            value={profile.direction.functions.map((item) => item.text).join("\n")}
            onChange={(value) => setDirectionList("functions", "id_function", value)}
          />
          <Field
            label={candidateProfileEditCopy.seniority}
            value={profile.direction.seniority?.text ?? ""}
            onChange={(value) =>
              setProfile((current) => ({
                ...current,
                direction: {
                  ...current.direction,
                  seniority: seekerFact(
                    current.direction.seniority?.id ?? "id_seniority",
                    value,
                  ),
                },
              }))
            }
            singleLine
          />
          <Field
            label={candidateProfileEditCopy.goals}
            hint={candidateProfileEditCopy.onePerLine}
            value={profile.direction.careerGoals.map((item) => item.text).join("\n")}
            onChange={(value) => setDirectionList("careerGoals", "id_goal", value)}
          />
        </div>
      </section>

      <section className="space-y-4" data-testid="profile-edit-experience">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">
            {candidateProfileEditCopy.experienceTitle}
          </h2>
          <AppButton
            type="button"
            variant="secondary"
            onClick={() =>
              setProfile((current) => ({
                ...current,
                experience: [...current.experience, emptyRole()],
              }))
            }
          >
            {candidateProfileEditCopy.addRole}
          </AppButton>
        </div>
        {profile.experience.map((role, index) => (
          <article
            key={role.id}
            className="space-y-3 rounded-md border border-edge p-4"
            data-testid={`profile-edit-role-${index}`}
          >
            <div className="flex flex-wrap gap-2">
              <AppButton
                type="button"
                variant="chip"
                onClick={() =>
                  setProfile((current) => ({
                    ...current,
                    experience: moveItem(current.experience, index, -1),
                  }))
                }
              >
                {candidateProfileEditCopy.moveRoleUp}
              </AppButton>
              <AppButton
                type="button"
                variant="chip"
                onClick={() =>
                  setProfile((current) => ({
                    ...current,
                    experience: moveItem(current.experience, index, 1),
                  }))
                }
              >
                {candidateProfileEditCopy.moveRoleDown}
              </AppButton>
              <AppButton
                type="button"
                variant="chip"
                onClick={() =>
                  setProfile((current) => ({
                    ...current,
                    experience: current.experience.filter(
                      (_, roleIndex) => roleIndex !== index,
                    ),
                  }))
                }
              >
                {candidateProfileEditCopy.removeRole}
              </AppButton>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label={candidateProfileEditCopy.employer}
                value={role.employer ?? ""}
                onChange={(value) => updateRole(index, { employer: value })}
                singleLine
              />
              <Field
                label={candidateProfileEditCopy.title}
                value={role.title ?? ""}
                onChange={(value) => updateRole(index, { title: value })}
                singleLine
              />
              <Field
                label={candidateProfileEditCopy.startDate}
                hint={candidateProfileEditCopy.dateHint}
                value={role.startDate ?? ""}
                onChange={(value) => updateRole(index, { startDate: value })}
                singleLine
              />
              <Field
                label={candidateProfileEditCopy.endDate}
                hint={candidateProfileEditCopy.dateHint}
                value={role.endDate ?? ""}
                onChange={(value) => updateRole(index, { endDate: value })}
                singleLine
              />
              <Field
                label={candidateProfileEditCopy.location}
                value={role.location ?? ""}
                onChange={(value) => updateRole(index, { location: value })}
                singleLine
              />
            </div>
            <Field
              label={candidateProfileEditCopy.summary}
              value={role.summary ?? ""}
              onChange={(value) => updateRole(index, { summary: value })}
            />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">
                  {candidateProfileEditCopy.achievements}
                </p>
                <AppButton
                  type="button"
                  variant="chip"
                  onClick={() =>
                    updateRole(index, {
                      achievements: [
                        ...role.achievements,
                        {
                          id: newId("ach"),
                          kind: "FACT",
                          text: "",
                          provenance: [{ sourceId: "pending-user-confirmation" }],
                        },
                      ],
                    })
                  }
                >
                  {candidateProfileEditCopy.addAchievement}
                </AppButton>
              </div>
              {role.achievements.map((achievement, achievementIndex) => (
                <div key={achievement.id} className="flex gap-2">
                  <AutosizeTextarea
                    value={achievement.text}
                    minRows={2}
                    onChange={(event) =>
                      updateRole(index, {
                        achievements: role.achievements.map((item, itemIndex) =>
                          itemIndex === achievementIndex
                            ? { ...item, text: event.target.value }
                            : item,
                        ),
                      })
                    }
                    className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
                  />
                  <div className="flex flex-col gap-1">
                    <AppButton
                      type="button"
                      variant="chip"
                      onClick={() =>
                        updateRole(index, {
                          achievements: moveItem(
                            role.achievements,
                            achievementIndex,
                            -1,
                          ),
                        })
                      }
                    >
                      {candidateProfileEditCopy.moveAchievementUp}
                    </AppButton>
                    <AppButton
                      type="button"
                      variant="chip"
                      onClick={() =>
                        updateRole(index, {
                          achievements: moveItem(
                            role.achievements,
                            achievementIndex,
                            1,
                          ),
                        })
                      }
                    >
                      {candidateProfileEditCopy.moveAchievementDown}
                    </AppButton>
                    <AppButton
                      type="button"
                      variant="chip"
                      onClick={() =>
                        updateRole(index, {
                          achievements: role.achievements.filter(
                            (_, itemIndex) => itemIndex !== achievementIndex,
                          ),
                        })
                      }
                    >
                      {candidateProfileEditCopy.removeAchievement}
                    </AppButton>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-4" data-testid="profile-edit-extras">
        <h2 className="text-base font-semibold text-ink">
          {candidateProfileEditCopy.extrasTitle}
        </h2>
        <Field
          label={candidateProfileEditCopy.skills}
          hint={candidateProfileEditCopy.onePerLine}
          value={profile.skills.map((item) => item.text).join("\n")}
          onChange={(value) =>
            setProfile((current) => ({
              ...current,
              skills: seekerFacts("skill", value),
            }))
          }
        />
        <Field
          label={candidateProfileEditCopy.education}
          hint={candidateProfileEditCopy.onePerLine}
          value={profile.education.map((item) => item.text).join("\n")}
          onChange={(value) =>
            setProfile((current) => ({
              ...current,
              education: seekerFacts("edu", value),
            }))
          }
        />
        <Field
          label={candidateProfileEditCopy.credentials}
          hint={candidateProfileEditCopy.onePerLine}
          value={profile.credentials.map((item) => item.text).join("\n")}
          onChange={(value) =>
            setProfile((current) => ({
              ...current,
              credentials: seekerFacts("cred", value),
            }))
          }
        />
        <Field
          label={candidateProfileEditCopy.awards}
          hint={candidateProfileEditCopy.onePerLine}
          value={profile.awards.map((item) => item.text).join("\n")}
          onChange={(value) =>
            setProfile((current) => ({
              ...current,
              awards: seekerFacts("award", value),
            }))
          }
        />
      </section>

      <SubmitButton disabled={pending}>
        {pending ? "Saving…" : candidateProfileEditCopy.save}
      </SubmitButton>
    </form>
  );
}

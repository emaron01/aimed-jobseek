import { vocab } from "@/lib/product-config";
import {
  parseCandidateProfileSafe,
  type CandidateProfile,
} from "@/lib/product-research/candidate-profile";

function Fact({ value }: { value: { text?: string } | null | undefined }) {
  if (!value?.text?.trim()) return null;
  return <p className="text-sm text-slate-800">{value.text}</p>;
}

function FactList({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; text: string }>;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li key={item.id} className="text-sm text-slate-800">
            {item.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ApprovedProfileBody({ profile }: { profile: CandidateProfile }) {
  return (
    <div className="space-y-4" data-testid="approved-personal-profile">
      <Fact value={profile.identity.name} />
      <Fact value={profile.identity.headline} />
      <Fact value={profile.identity.location} />
      <Fact value={profile.positioning} />
      {profile.experience.map((role) => (
        <div key={role.id} className="space-y-1">
          <p className="text-sm font-medium text-slate-900">
            {[role.title, role.employer].filter(Boolean).join(" · ")}
          </p>
          <p className="text-xs text-slate-600">
            {[role.startDate, role.endDate ?? "Present"].filter(Boolean).join(" – ")}
            {role.location ? ` · ${role.location}` : ""}
          </p>
          {role.summary ? <p className="text-sm text-slate-800">{role.summary}</p> : null}
          {role.achievements.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {role.achievements.map((item) => (
                <li key={item.id} className="text-sm text-slate-800">
                  {item.text}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      <FactList title="Skills" items={profile.skills} />
      <FactList title="Education" items={profile.education} />
      <FactList title="Credentials" items={profile.credentials} />
    </div>
  );
}

export function ApprovedProductProfile({ profileJson }: { profileJson: unknown }) {
  const parsed = parseCandidateProfileSafe(profileJson);
  if (!parsed.ok) {
    return (
      <p className="text-sm text-slate-600">
        The approved {vocab.product.singular} could not be displayed.
      </p>
    );
  }
  return <ApprovedProfileBody profile={parsed.profile} />;
}

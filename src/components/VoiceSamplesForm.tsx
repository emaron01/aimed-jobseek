"use client";
import { PRIMARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  deleteVoiceSampleAction,
  saveVoiceSampleAction,
  type VoiceActionResult,
} from "@/app/actions/voice";
import { voiceReadiness, type VoiceSampleView } from "@/lib/voice/types";

const initial: VoiceActionResult | null = null;

function DeleteSampleForm({ sample }: { sample: VoiceSampleView }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    deleteVoiceSampleAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="voiceSampleId" value={sample.id} />
      <AppButton
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-red-800 underline disabled:opacity-60"
      >
        {pending ? "Removing…" : "Delete"}
      </AppButton>
      {state && !state.ok ? (
        <p role="status" className="mt-1 text-xs text-red-600">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function VoiceSamplesForm({
  samples,
}: {
  samples: VoiceSampleView[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    saveVoiceSampleAction,
    initial,
  );
  const readiness = voiceReadiness(samples.length);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <section className="space-y-4" data-testid="voice-samples">
      <div>
        <h2 className="text-lg font-medium">Writing voice</h2>
        <p className="mt-1 text-sm text-slate-600">
          Paste emails you have already sent. Voice belongs to you, not the
          workspace. This is optional — without samples, generation uses a
          neutral professional register.
        </p>
        <p
          className="mt-2 text-sm font-medium text-slate-800"
          data-testid="voice-readiness"
        >
          {readiness.message}
        </p>
      </div>

      <form
        key={samples[0]?.id ?? "empty"}
        action={formAction}
        className="space-y-3"
        data-testid="voice-sample-form"
      >
        {state ? (
          <p
            role="status"
            data-testid="voice-action-status"
            className={
              state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"
            }
          >
            {state.message}
          </p>
        ) : null}
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Label</span>
          <input
            name="label"
            required
            placeholder="e.g. Cold intro to a CRO"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">
            Sent email (one sample)
          </span>
          <textarea
            name="sampleText"
            required
            minLength={100}
            rows={8}
            placeholder="Paste one sent email — greeting through sign-off."
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2"
          />
        </label>
        <AppButton
          type="submit"
          disabled={pending}
          className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
        >
          {pending ? "Saving…" : "Save sample"}
        </AppButton>
      </form>

      {samples.length > 0 ? (
        <ul className="space-y-3" data-testid="voice-sample-list">
          {samples.map((sample) => (
            <li
              key={sample.id}
              className="rounded-md border border-slate-200 bg-white px-3 py-3"
            >
              <p className="text-sm font-medium text-slate-900">{sample.label}</p>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-slate-600">
                {sample.sampleText}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {sample.sampleText.length} characters · pasted
              </p>
              <DeleteSampleForm sample={sample} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

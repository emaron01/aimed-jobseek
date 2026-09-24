const EXAMPLES = [
  "Emphasize the work that matches this role.",
  "Keep claims to facts already on your Personal Profile.",
  "Mention the shipping or reliability result that fits this posting.",
  "Use a professional tone and keep it concise.",
  "Do not invent titles, employers, or metrics.",
  "Ask for a brief conversation about the role.",
] as const;

export function EmailGuidancePromptExamples() {
  return (
    <details className="mt-1 text-xs text-slate-500">
      <summary className="w-fit cursor-pointer font-medium text-slate-600">
        Prompt examples
      </summary>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {EXAMPLES.map((example) => (
          <li key={example}>“{example}”</li>
        ))}
      </ul>
    </details>
  );
}

export function CheatSheetGenerationError({
  message,
}: {
  message: string | null;
}) {
  if (!message) return null;
  return (
    <p
      role="alert"
      data-testid="cheat-sheet-generation-error"
      className="mt-2 text-sm text-danger"
    >
      {message}
    </p>
  );
}

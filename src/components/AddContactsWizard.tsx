"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  checkImportDuplicatesAction,
  importContactsAction,
} from "@/app/actions/import";
import {
  CONTACT_FIELD_KEYS,
  CONTACT_FIELD_LABELS,
  assertUniqueFieldMappings,
  defaultListNameForPaste,
  defaultListNameForUpload,
  parseDelimitedText,
  parseXlsxArrayBuffer,
  suggestColumnMapping,
  validateMappedRows,
  type ColumnMapping,
  type DuplicateMode,
  type ImportSourceType,
  type MappedDestination,
  type ParsedTable,
  type ValidatedRow,
} from "@/lib/import";
import { PRIMARY_BUTTON_CLASS, PrimaryButton, SecondaryButton, AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { vocab, vocabExamples } from "@/lib/product-config";

type Step =
  | "choose"
  | "input"
  | "preview"
  | "map"
  | "validate"
  | "name"
  | "done";

type InputMode = "paste" | "upload";

export function AddContactsWizard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("choose");
  const [mode, setMode] = useState<InputMode>("paste");
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [parsed, setParsed] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [validated, setValidated] = useState<ValidatedRow[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [duplicateIndexes, setDuplicateIndexes] = useState<number[]>([]);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("skip");
  const [listName, setListName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    listId: string;
    importedCount: number;
    suppressedCount: number;
    emailMissingCount: number;
    mergedCount: number;
    titleChangedCount: number;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const sourceType: ImportSourceType = mode === "paste" ? "PASTE" : "UPLOAD";

  const counts = useMemo(() => {
    const valid = validated.filter((row) => row.status === "valid").length;
    const warning = validated.filter((row) => row.status === "warning").length;
    const invalid = validated.filter((row) => row.status === "invalid").length;
    return { valid, warning, invalid };
  }, [validated]);

  function reset() {
    setStep("choose");
    setMode("paste");
    setPasteText("");
    setFileName(null);
    setFileBuffer(null);
    setParsed(null);
    setMapping({});
    setValidated([]);
    setDuplicateCount(0);
    setDuplicateIndexes([]);
    setDuplicateMode("skip");
    setListName("");
    setError(null);
    setImportResult(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function openWizard() {
    reset();
    setOpen(true);
  }

  function applyParsed(table: ParsedTable, nextListName: string) {
    if (table.headers.length === 0 || table.totalRows === 0) {
      setError(table.errors[0] ?? "No rows found to import.");
      return;
    }
    setParsed(table);
    setMapping(suggestColumnMapping(table.headers));
    setListName(nextListName);
    setError(table.errors[0] ?? null);
    setStep("preview");
  }

  function handleParsePaste() {
    setError(null);
    const table = parseDelimitedText(pasteText);
    applyParsed(table, defaultListNameForPaste());
  }

  async function handleParseUpload(file: File) {
    setError(null);
    setFileName(file.name);
    const lower = file.name.toLowerCase();

    try {
      if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
        const text = await file.text();
        applyParsed(parseDelimitedText(text), defaultListNameForUpload(file.name));
        return;
      }

      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        const buffer = await file.arrayBuffer();
        setFileBuffer(buffer);
        const table = parseXlsxArrayBuffer(buffer);
        applyParsed(table, defaultListNameForUpload(file.name));
        return;
      }

      setError("Unsupported file type. Upload a CSV or XLSX file.");
    } catch {
      setError("Unable to read that file. Please try another export.");
    }
  }

  function handleSheetChange(sheetName: string) {
    if (!fileBuffer) return;
    const table = parseXlsxArrayBuffer(fileBuffer, sheetName);
    setParsed(table);
    setMapping(suggestColumnMapping(table.headers));
    setError(table.errors[0] ?? null);
  }

  function handleContinueFromMap() {
    if (!parsed) return;
    const uniqueness = assertUniqueFieldMappings(mapping);
    if (!uniqueness.ok) {
      setError(uniqueness.error);
      return;
    }

    const rows = validateMappedRows(parsed.headers, parsed.rows, mapping);
    setValidated(rows);
    setError(null);
    setStep("validate");

    const importable = rows
      .filter((row) => row.status !== "invalid")
      .map((row) => row.contact);

    startTransition(async () => {
      const result = await checkImportDuplicatesAction(importable);
      if (!result.ok) {
        setError(result.error ?? "Duplicate check failed.");
        return;
      }
      setDuplicateCount(result.potentialDuplicates);
      setDuplicateIndexes(result.duplicateIndexes);
    });
  }

  function handleImport() {
    const importable = validated
      .filter((row) => row.status !== "invalid")
      .map((row) => row.contact);

    if (!listName.trim()) {
      setError("List name is required.");
      return;
    }
    if (importable.length === 0) {
      setError("No valid rows to import.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await importContactsAction({
        name: listName,
        sourceType,
        originalFilename: mode === "upload" ? fileName : null,
        contacts: importable,
        duplicateMode,
      });

      if (!result.ok || !result.listId) {
        setError(result.error ?? "Import failed.");
        return;
      }

      setImportResult({
        listId: result.listId,
        importedCount: result.importedCount ?? 0,
        suppressedCount: result.suppressedCount ?? 0,
        emailMissingCount: result.emailMissingCount ?? 0,
        mergedCount: result.mergedCount ?? 0,
        titleChangedCount: result.titleChangedCount ?? 0,
      });
      setStep("done");
      router.refresh();
    });
  }

  const previewRows = parsed?.rows.slice(0, 10) ?? [];
  const invalidRows = validated.filter((row) => row.status === "invalid");

  return (
    <>
      <PrimaryButton onClick={openWizard}>Add {vocab.contact.Plural}</PrimaryButton>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:p-8">
          <div className="w-full max-w-4xl rounded-lg border border-edge bg-surface shadow-xl">
            <div className="flex items-start justify-between border-b border-edge px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-ink">
                  Add {vocab.contact.Plural}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Paste or upload {vocab.contact.plural}, map columns, then import into this
                  organization.
                </p>
              </div>
              <SecondaryButton onClick={close}>Close</SecondaryButton>
            </div>

            <div className="border-b border-edge px-5 py-3">
              <StepIndicator step={step} />
            </div>

            <div className="space-y-5 px-5 py-5">
              {error ? (
                <div className="rounded-md border border-danger bg-danger-tint px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              ) : null}

              {step === "choose" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <ChoiceCard
                    title={`Paste ${vocab.contact.Plural}`}
                    description="Paste rows copied from Excel, Sheets, Apollo, or CSV text."
                    onClick={() => {
                      setMode("paste");
                      setStep("input");
                      setError(null);
                    }}
                  />
                  <ChoiceCard
                    title="Upload File"
                    description="Upload a CSV or XLSX export. No Excel install required."
                    onClick={() => {
                      setMode("upload");
                      setStep("input");
                      setError(null);
                    }}
                  />
                </div>
              ) : null}

              {step === "input" && mode === "paste" ? (
                <div className="space-y-4">
                  <label className="block text-sm">
                    <span className="font-medium text-ink">
                      Paste tabular {vocab.contact.plural}
                    </span>
                    <textarea
                      value={pasteText}
                      onChange={(event) => setPasteText(event.target.value)}
                      rows={12}
                      placeholder={vocabExamples.contactImportPastePlaceholder}
                      className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 font-mono text-xs text-ink outline-none ring-focus focus:ring-2"
                    />
                  </label>
                  <div className="flex gap-2">
                    <SecondaryButton onClick={() => setStep("choose")}>
                      Back
                    </SecondaryButton>
                    <PrimaryButton onClick={handleParsePaste}>
                      Preview
                    </PrimaryButton>
                  </div>
                </div>
              ) : null}

              {step === "input" && mode === "upload" ? (
                <div className="space-y-4">
                  <label className="block text-sm">
                    <span className="font-medium text-ink">
                      Upload CSV or XLSX
                    </span>
                    <input
                      type="file"
                      accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className={cn(PRIMARY_BUTTON_CLASS, "mt-2", "block", "w-full")}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleParseUpload(file);
                      }}
                    />
                  </label>
                  <div className="flex gap-2">
                    <SecondaryButton onClick={() => setStep("choose")}>
                      Back
                    </SecondaryButton>
                  </div>
                </div>
              ) : null}

              {step === "preview" && parsed ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-4 text-sm text-muted">
                    <span>
                      Columns:{" "}
                      <strong className="text-ink">
                        {parsed.headers.length}
                      </strong>
                    </span>
                    <span>
                      Rows:{" "}
                      <strong className="text-ink">
                        {parsed.totalRows}
                      </strong>
                    </span>
                    {parsed.delimiter ? (
                      <span>
                        Delimiter:{" "}
                        <strong className="text-ink">
                          {parsed.delimiter === "\t"
                            ? "tab"
                            : parsed.delimiter}
                        </strong>
                      </span>
                    ) : null}
                  </div>

                  {parsed.sheetNames && parsed.sheetNames.length > 1 ? (
                    <label className="block text-sm">
                      <span className="font-medium text-ink">
                        Worksheet
                      </span>
                      <select
                        className="mt-1 rounded-md border border-edge-strong px-3 py-2 text-sm"
                        value={parsed.activeSheet}
                        onChange={(event) =>
                          handleSheetChange(event.target.value)
                        }
                      >
                        {parsed.sheetNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <div className="overflow-x-auto rounded-md border border-edge">
                    <table className="min-w-full divide-y divide-edge text-xs">
                      <thead className="bg-canvas text-left text-subtle">
                        <tr>
                          {parsed.headers.map((header) => (
                            <th key={header} className="px-3 py-2 font-medium">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewRows.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {row.map((cell, cellIndex) => (
                              <td
                                key={`${rowIndex}-${cellIndex}`}
                                className="px-3 py-2 text-ink"
                              >
                                {cell || "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-2">
                    <SecondaryButton onClick={() => setStep("input")}>
                      Back
                    </SecondaryButton>
                    <PrimaryButton onClick={() => setStep("map")}>
                      Map Columns
                    </PrimaryButton>
                  </div>
                </div>
              ) : null}

              {step === "map" && parsed ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted">
                    Suggested mappings are editable. Unmapped source columns are
                    preserved in raw data.
                  </p>
                  <div className="overflow-hidden rounded-md border border-edge">
                    <table className="min-w-full divide-y divide-edge text-sm">
                      <thead className="bg-canvas text-left text-subtle">
                        <tr>
                          <th className="px-4 py-3 font-medium">Source column</th>
                          <th className="px-4 py-3 font-medium">Maps to</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsed.headers.map((header) => (
                          <tr key={header}>
                            <td className="px-4 py-3 text-ink">{header}</td>
                            <td className="px-4 py-3">
                              <select
                                className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
                                value={mapping[header] ?? "ignore"}
                                onChange={(event) =>
                                  setMapping((current) => ({
                                    ...current,
                                    [header]: event.target
                                      .value as MappedDestination,
                                  }))
                                }
                              >
                                <option value="ignore">Ignore Column</option>
                                {CONTACT_FIELD_KEYS.map((key) => (
                                  <option key={key} value={key}>
                                    {CONTACT_FIELD_LABELS[key]}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-2">
                    <SecondaryButton onClick={() => setStep("preview")}>
                      Back
                    </SecondaryButton>
                    <PrimaryButton onClick={handleContinueFromMap}>
                      Validate
                    </PrimaryButton>
                  </div>
                </div>
              ) : null}

              {step === "validate" ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Stat label="Valid rows" value={counts.valid} />
                    <Stat label="Rows with warnings" value={counts.warning} />
                    <Stat label="Invalid rows" value={counts.invalid} />
                    <Stat
                      label="Potential duplicates"
                      value={pending ? "…" : duplicateCount}
                    />
                  </div>

                  {invalidRows.length > 0 ? (
                    <div className="rounded-md border border-warning bg-warning-tint p-3">
                      <p className="text-sm font-medium text-warning">
                        Invalid rows (will be excluded)
                      </p>
                      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-warning">
                        {invalidRows.slice(0, 25).map((row) => (
                          <li key={row.rowNumber}>
                            Row {row.rowNumber}:{" "}
                            {row.issues
                              .filter((issue) => issue.level === "error")
                              .map((issue) => issue.message)
                              .join("; ")}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="rounded-md border border-edge p-3 text-sm text-muted">
                    Warning rows (for example missing email) will still import.
                    Duplicate indexes found:{" "}
                    {duplicateIndexes.length > 0
                      ? duplicateIndexes
                          .slice(0, 12)
                          .map((index) => index + 1)
                          .join(", ")
                      : "none"}
                    {duplicateIndexes.length > 12 ? "…" : ""}
                  </div>

                  <div className="flex gap-2">
                    <SecondaryButton onClick={() => setStep("map")}>
                      Back
                    </SecondaryButton>
                    <PrimaryButton
                      disabled={counts.valid + counts.warning === 0 || pending}
                      onClick={() => setStep("name")}
                    >
                      Name {vocab.list.Singular}
                    </PrimaryButton>
                  </div>
                </div>
              ) : null}

              {step === "name" ? (
                <div className="space-y-4">
                  <label className="block text-sm">
                    <span className="font-medium text-ink">{vocab.list.Singular} name</span>
                    <input
                      value={listName}
                      onChange={(event) => setListName(event.target.value)}
                      className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm outline-none ring-focus focus:ring-2"
                    />
                  </label>

                  <fieldset className="space-y-2 text-sm">
                    <legend className="font-medium text-ink">
                      Potential duplicates: {duplicateCount}
                    </legend>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="duplicateMode"
                        checked={duplicateMode === "skip"}
                        onChange={() => setDuplicateMode("skip")}
                      />
                      Skip duplicates (default)
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="duplicateMode"
                        checked={duplicateMode === "import"}
                        onChange={() => setDuplicateMode("import")}
                      />
                      Import anyway
                    </label>
                  </fieldset>

                  <div className="flex gap-2">
                    <SecondaryButton onClick={() => setStep("validate")}>
                      Back
                    </SecondaryButton>
                    <PrimaryButton disabled={pending} onClick={handleImport}>
                      {pending ? "Importing…" : "Import"}
                    </PrimaryButton>
                  </div>
                </div>
              ) : null}

              {step === "done" && importResult ? (
                <div className="space-y-4">
                  <div className="rounded-md border border-success bg-success-tint px-4 py-3 text-sm text-success">
                    Imported {importResult.importedCount} {vocab.contact.plural} into “
                    {listName}”.
                    {importResult.mergedCount > 0 ? (
                      <p className="mt-2">
                        {importResult.mergedCount} matched an existing person in
                        this organization and were linked to this {vocab.list.singular}
                        (incoming non-empty fields win).
                      </p>
                    ) : null}
                    {importResult.titleChangedCount > 0 ? (
                      <p className="mt-2">
                        {importResult.titleChangedCount} had a title change
                        recorded (previous title kept for {vocab.persona.singular}-matching
                        audit).
                      </p>
                    ) : null}
                    {importResult.emailMissingCount > 0 ? (
                      <p className="mt-2">
                        {importResult.emailMissingCount} have no email address.
                        They are stored and marked unusable — they cannot be
                        emailed, scored, or suppressed.
                      </p>
                    ) : null}
                    {importResult.suppressedCount > 0 ? (
                      <p className="mt-2">
                        {importResult.suppressedCount} match the organization
                        do-not-contact list. They remain visible so you can see
                        why they are missing from scoring and email, but they
                        cannot be qualified or emailed until restored.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <PrimaryButton
                      onClick={() => {
                        close();
                        router.push(`/lists/${importResult.listId}`);
                      }}
                    >
                      View {vocab.list.singular}
                    </PrimaryButton>
                    <SecondaryButton
                      onClick={() => {
                        close();
                        router.push("/contacts");
                      }}
                    >
                      View all {vocab.contact.plural}
                    </SecondaryButton>
                    <SecondaryButton onClick={close}>Done</SecondaryButton>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ChoiceCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <AppButton
      type="button"
      onClick={onClick}
      className="rounded-lg border border-edge bg-canvas px-4 py-5 text-left transition hover:border-edge-strong hover:bg-surface"
    >
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </AppButton>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-edge bg-canvas px-3 py-3">
      <p className="text-xs text-subtle">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: Array<{ id: Step; label: string }> = [
    { id: "choose", label: "Source" },
    { id: "input", label: "Input" },
    { id: "preview", label: "Preview" },
    { id: "map", label: "Map" },
    { id: "validate", label: "Validate" },
    { id: "name", label: "Import" },
  ];

  const activeIndex = Math.max(
    0,
    steps.findIndex((item) => item.id === step),
  );

  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {steps.map((item, index) => (
        <li
          key={item.id}
          className={cn(
            "rounded-full px-2.5 py-1",
            index <= activeIndex || step === "done"
              ? "bg-ink text-on-ink"
              : "bg-canvas text-subtle",
          )}
        >
          {item.label}
        </li>
      ))}
    </ol>
  );
}

export const CONSULTATION_STATUSES = [
  "IN_PROGRESS",
  "PAUSED",
  "SKIPPED",
  "DONE",
] as const;

export type ConsultationStatusName = (typeof CONSULTATION_STATUSES)[number];

export type ConsultationCommand = "pause" | "resume" | "skip" | "done";

export function nextConsultationStatus(
  current: ConsultationStatusName,
  command: ConsultationCommand,
): ConsultationStatusName {
  if (current === "DONE" && command !== "done") {
    throw new Error("This consultation is already done.");
  }
  switch (command) {
    case "pause":
      if (current !== "IN_PROGRESS") {
        throw new Error("Only an in-progress consultation can be paused.");
      }
      return "PAUSED";
    case "resume":
      if (current !== "PAUSED" && current !== "SKIPPED") {
        throw new Error("Only a paused or skipped consultation can be resumed.");
      }
      return "IN_PROGRESS";
    case "skip":
      if (current === "DONE") throw new Error("This consultation is already done.");
      return "SKIPPED";
    case "done":
      if (current === "SKIPPED") {
        throw new Error("A skipped consultation is ended with skip, not done.");
      }
      return "DONE";
    default: {
      const _exhaustive: never = command;
      throw new Error(`Unknown consultation command: ${String(_exhaustive)}.`);
    }
  }
}

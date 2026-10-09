import { EmptyState } from "@/components/design";
import { AppActionLink } from "@/components/ui";
import {
  applicationStepByKey,
  applicationStepCopy,
  polishCopy,
  type ApplicationStepKey,
} from "@/lib/product-config";

export type ApplicationWorkspaceFocus = ApplicationStepKey | "overview";

export function ApplicationWorkspaceEmpty({
  focus,
}: {
  focus: ApplicationWorkspaceFocus;
}) {
  const step =
    focus === "overview" ? null : applicationStepByKey(focus);
  return (
    <EmptyState
      title={step?.title ?? applicationStepCopy.dashboardTitle}
      description={step?.emptyGuidance ?? applicationStepCopy.factMissing}
      actions={
        <AppActionLink href="/campaigns" variant="secondary">
          {polishCopy.backToApplications}
        </AppActionLink>
      }
    />
  );
}

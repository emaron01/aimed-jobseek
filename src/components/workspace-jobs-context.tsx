"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { WorkspaceJobStatusView } from "@/lib/application-jobs/workspace-status";

type WorkspaceJobsContextValue = {
  jobs: WorkspaceJobStatusView[];
  replaceJobs: (jobs: WorkspaceJobStatusView[]) => void;
};

const WorkspaceJobsContext = createContext<WorkspaceJobsContextValue>({
  jobs: [],
  replaceJobs: () => undefined,
});

export function workspaceJobListSignature(jobs: WorkspaceJobStatusView[]): string {
  return jobs.map((job) => `${job.id}:${job.status}:${job.error ?? ""}`).join("|");
}

export function WorkspaceJobsProvider({
  initialJobs,
  children,
}: {
  initialJobs: WorkspaceJobStatusView[];
  children: ReactNode;
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const appliedInitial = useRef(workspaceJobListSignature(initialJobs));

  const replaceJobs = useCallback((next: WorkspaceJobStatusView[]) => {
    setJobs(next);
  }, []);

  useEffect(() => {
    const signature = workspaceJobListSignature(initialJobs);
    if (signature === appliedInitial.current) return;
    appliedInitial.current = signature;
    setJobs(initialJobs);
  }, [initialJobs]);

  const value = useMemo(() => ({ jobs, replaceJobs }), [jobs, replaceJobs]);
  return (
    <WorkspaceJobsContext.Provider value={value}>
      {children}
    </WorkspaceJobsContext.Provider>
  );
}

export function useWorkspaceJobs(): WorkspaceJobStatusView[] {
  return useContext(WorkspaceJobsContext).jobs;
}

export function useReplaceWorkspaceJobs(): (
  jobs: WorkspaceJobStatusView[],
) => void {
  return useContext(WorkspaceJobsContext).replaceJobs;
}

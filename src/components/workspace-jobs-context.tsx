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
import { readApplicationJobStatusesAction } from "@/app/actions/application-jobs";
import type { WorkspaceJobStatusView } from "@/lib/application-jobs/workspace-status";

type WorkspaceJobsContextValue = {
  jobs: WorkspaceJobStatusView[];
  missingJobIds: string[];
  replaceJobs: (jobs: WorkspaceJobStatusView[]) => void;
  watchJobIds: (ids: string[]) => void;
};

const WorkspaceJobsContext = createContext<WorkspaceJobsContextValue>({
  jobs: [],
  missingJobIds: [],
  replaceJobs: () => undefined,
  watchJobIds: () => undefined,
});

export function workspaceJobListSignature(jobs: WorkspaceJobStatusView[]): string {
  return jobs.map((job) => `${job.id}:${job.status}:${job.error ?? ""}`).join("|");
}

function isTerminal(job: WorkspaceJobStatusView): boolean {
  return job.status === "COMPLETED" || job.status === "FAILED";
}

export function WorkspaceJobsProvider({
  initialJobs,
  campaignId,
  children,
}: {
  initialJobs: WorkspaceJobStatusView[];
  campaignId?: string;
  children: ReactNode;
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const [missingJobIds, setMissingJobIds] = useState<string[]>([]);
  const [watchVersion, setWatchVersion] = useState(0);
  const appliedInitial = useRef(workspaceJobListSignature(initialJobs));
  const watchedRef = useRef(new Set<string>());
  const jobsRef = useRef(jobs);
  const missingRef = useRef(new Set<string>());

  const publish = useCallback((next: WorkspaceJobStatusView[], replace: boolean) => {
    setJobs((prev) => {
      const published = (() => {
        if (!replace) {
          const merged = new Map(prev.map((job) => [job.id, job]));
          for (const job of next) merged.set(job.id, job);
          return [...merged.values()];
        }
        const incoming = new Set(next.map((job) => job.id));
        const kept = prev.filter(
          (job) => watchedRef.current.has(job.id) && !incoming.has(job.id) && isTerminal(job),
        );
        return [...next, ...kept];
      })();
      if (workspaceJobListSignature(prev) === workspaceJobListSignature(published)) return prev;
      return published;
    });
    if (next.length > 0) {
      const found = new Set(next.map((job) => job.id));
      setMissingJobIds((prev) => prev.filter((id) => !found.has(id)));
    }
  }, []);

  const replaceJobs = useCallback(
    (next: WorkspaceJobStatusView[]) => {
      publish(next, true);
    },
    [publish],
  );

  const watchJobIds = useCallback((ids: string[]) => {
    let changed = false;
    for (const id of ids) {
      if (watchedRef.current.has(id)) continue;
      watchedRef.current.add(id);
      changed = true;
    }
    if (changed) setWatchVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const signature = workspaceJobListSignature(initialJobs);
    if (signature === appliedInitial.current) return;
    appliedInitial.current = signature;
    publish(initialJobs, true);
  }, [initialJobs, publish]);

  useEffect(() => {
    jobsRef.current = jobs;
    missingRef.current = new Set(missingJobIds);
  }, [jobs, missingJobIds]);

  const knownIds = jobs.map((job) => job.id).join("|");
  useEffect(() => {
    if (!campaignId) return;
    const known = new Set(jobsRef.current.map((job) => job.id));
    const missing = [...watchedRef.current].filter(
      (id) => !known.has(id) && !missingRef.current.has(id),
    );
    if (missing.length === 0) return;
    let cancelled = false;
    void readApplicationJobStatusesAction(campaignId, missing).then((found) => {
      if (cancelled || !found) return;
      const foundIds = new Set(found.map((job) => job.id));
      const absent = missing.filter((id) => !foundIds.has(id));
      if (found.length > 0) publish(found, false);
      if (absent.length > 0) {
        setMissingJobIds((prev) => [...new Set([...prev, ...absent])]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [campaignId, knownIds, publish, watchVersion]);

  const value = useMemo(
    () => ({ jobs, missingJobIds, replaceJobs, watchJobIds }),
    [jobs, missingJobIds, replaceJobs, watchJobIds],
  );
  return (
    <WorkspaceJobsContext.Provider value={value}>
      {children}
    </WorkspaceJobsContext.Provider>
  );
}

export function useWorkspaceJobs(): WorkspaceJobStatusView[] {
  return useContext(WorkspaceJobsContext).jobs;
}

export function useWorkspaceJobResolution(): {
  jobs: WorkspaceJobStatusView[];
  missingJobIds: string[];
  watchJobIds: (ids: string[]) => void;
} {
  const { jobs, missingJobIds, watchJobIds } = useContext(WorkspaceJobsContext);
  return { jobs, missingJobIds, watchJobIds };
}

export function useReplaceWorkspaceJobs(): (
  jobs: WorkspaceJobStatusView[],
) => void {
  return useContext(WorkspaceJobsContext).replaceJobs;
}

import { afterEach, describe, expect, it } from "vitest";
import {
  RESEARCH_CONCURRENCY_DEFAULT,
  RESEARCH_WORKER_CONCURRENCY_DEFAULT,
  getResearchConcurrency,
  getResearchQueuedStaleMs,
  getResearchWorkerConcurrency,
} from "@/lib/research/config";
import { RESEARCH_RUN_QUEUED_STALE_MS_DEFAULT } from "@/lib/research/run-types";

describe("getResearchConcurrency", () => {
  const original = process.env.RESEARCH_CONCURRENCY;

  afterEach(() => {
    if (original === undefined) delete process.env.RESEARCH_CONCURRENCY;
    else process.env.RESEARCH_CONCURRENCY = original;
  });

  it("defaults to 5 when unset", () => {
    delete process.env.RESEARCH_CONCURRENCY;
    expect(getResearchConcurrency()).toBe(RESEARCH_CONCURRENCY_DEFAULT);
  });

  it("reads RESEARCH_CONCURRENCY from env", () => {
    process.env.RESEARCH_CONCURRENCY = "10";
    expect(getResearchConcurrency()).toBe(10);
  });

  it("caps at 50", () => {
    process.env.RESEARCH_CONCURRENCY = "100";
    expect(getResearchConcurrency()).toBe(50);
  });

  it("rejects invalid values", () => {
    process.env.RESEARCH_CONCURRENCY = "0";
    expect(() => getResearchConcurrency()).toThrow(/RESEARCH_CONCURRENCY/);
  });
});

describe("getResearchWorkerConcurrency", () => {
  const original = process.env.RESEARCH_WORKER_CONCURRENCY;

  afterEach(() => {
    if (original === undefined) delete process.env.RESEARCH_WORKER_CONCURRENCY;
    else process.env.RESEARCH_WORKER_CONCURRENCY = original;
  });

  it("defaults to 5 when unset", () => {
    delete process.env.RESEARCH_WORKER_CONCURRENCY;
    expect(getResearchWorkerConcurrency()).toBe(
      RESEARCH_WORKER_CONCURRENCY_DEFAULT,
    );
  });

  it("reads RESEARCH_WORKER_CONCURRENCY from env", () => {
    process.env.RESEARCH_WORKER_CONCURRENCY = "8";
    expect(getResearchWorkerConcurrency()).toBe(8);
  });
});

describe("getResearchQueuedStaleMs", () => {
  const original = process.env.RESEARCH_QUEUED_STALE_MS;

  afterEach(() => {
    if (original === undefined) delete process.env.RESEARCH_QUEUED_STALE_MS;
    else process.env.RESEARCH_QUEUED_STALE_MS = original;
  });

  it("defaults when unset", () => {
    delete process.env.RESEARCH_QUEUED_STALE_MS;
    expect(getResearchQueuedStaleMs()).toBe(RESEARCH_RUN_QUEUED_STALE_MS_DEFAULT);
  });

  it("reads RESEARCH_QUEUED_STALE_MS from env", () => {
    process.env.RESEARCH_QUEUED_STALE_MS = "45000";
    expect(getResearchQueuedStaleMs()).toBe(45_000);
  });

  it("rejects invalid values", () => {
    process.env.RESEARCH_QUEUED_STALE_MS = "100";
    expect(() => getResearchQueuedStaleMs()).toThrow(/RESEARCH_QUEUED_STALE_MS/);
  });
});

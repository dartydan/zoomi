import { createHook, sleep } from "workflow";

export async function auditWebsite(jobId: string) {
  "use workflow";
  using lease = createHook({ token: `audit:${jobId}` });
  if (await lease.getConflict()) return;
  try {
    for (;;) {
      const result = await scanBatch(jobId);
      if (result === "done") return;
      if (result === "busy") await sleep("5m");
    }
  } catch {
    await failed(jobId);
  }
}
async function scanBatch(jobId: string) {
  "use step";
  const { runBatch } = await import("../server/jobs");
  return runBatch(jobId);
}
scanBatch.maxRetries = 5;
async function failed(jobId: string) {
  "use step";
  const { markWorkflowFailed } = await import("../server/jobs");
  await markWorkflowFailed(jobId);
}

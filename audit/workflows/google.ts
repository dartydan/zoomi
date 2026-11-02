import { createHook, sleep } from "workflow";
export async function refreshGoogle(runId: string) {
  "use workflow";
  using lease = createHook({ token: `google-refresh:${runId}` });
  if (await lease.getConflict()) return;
  try {
    while ((await refresh(runId)) === "busy") await sleep("5m");
  } catch {
    await failed(runId);
  }
}
async function refresh(id: string) {
  "use step";
  const { runGoogleRefresh } = await import("../server/schedules");
  return runGoogleRefresh(id);
}
refresh.maxRetries = 5;
async function failed(id: string) {
  "use step";
  const { markRefreshFailed } = await import("../server/schedules");
  await markRefreshFailed(id);
}

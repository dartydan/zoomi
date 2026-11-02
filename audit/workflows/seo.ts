import { createHook, sleep } from "workflow";
export async function refreshSeo(id: string) {
  "use workflow";
  using lease = createHook({ token: `seo:${id}` });
  if (await lease.getConflict()) return;
  try {
    for (;;) {
      const state = await next(id);
      if (state === "done") return;
      if (state === "busy") await sleep("5m");
    }
  } catch {
    await failed(id);
  }
}
async function next(id: string) {
  "use step";
  const { runSeoStep } = await import("../server/seo-jobs");
  return runSeoStep(id);
}
next.maxRetries = 5;
async function failed(id: string) {
  "use step";
  const { failSeo } = await import("../server/seo-jobs");
  await failSeo(id);
}

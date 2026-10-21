import { Router } from "express";
import * as seo from "./seo";
import * as jobs from "./seo-jobs";
export const seoRoutes = Router();
// Mounted only after authentication and the project ownership middleware.
seoRoutes.get("/seo/capabilities", async (_req, res) =>
  res.json(await seo.capabilities(res.locals.user.id)),
);
seoRoutes.get("/keywords", async (_req, res) =>
  res.json(await seo.listKeywords(res.locals.user.id, res.locals.project.id)),
);
seoRoutes.post("/keywords", async (req, res) => {
  await seo.saveKeyword(res.locals.user.id, res.locals.project.id, req.body);
  res
    .status(201)
    .json(await seo.listKeywords(res.locals.user.id, res.locals.project.id));
});
seoRoutes.patch("/keywords/:id", async (req, res) => {
  await seo.setKeywordActive(
    res.locals.user.id,
    res.locals.project.id,
    String(req.params.id),
    req.body.active,
  );
  res.json(await seo.listKeywords(res.locals.user.id, res.locals.project.id));
});
seoRoutes.delete("/keywords/:id", async (req, res) => {
  await seo.removeKeyword(
    res.locals.user.id,
    res.locals.project.id,
    String(req.params.id),
  );
  res.json(await seo.listKeywords(res.locals.user.id, res.locals.project.id));
});
seoRoutes.get("/keywords/:id/history", async (req, res) =>
  res.json(
    await seo.history(
      res.locals.user.id,
      res.locals.project.id,
      String(req.params.id),
    ),
  ),
);
seoRoutes.get("/competitors", async (_req, res) =>
  res.json(
    await seo.listCompetitors(res.locals.user.id, res.locals.project.id),
  ),
);
seoRoutes.post("/competitors", async (req, res) => {
  await seo.addCompetitor(
    res.locals.user.id,
    res.locals.project.id,
    req.body.domain,
  );
  res
    .status(201)
    .json(await seo.listCompetitors(res.locals.user.id, res.locals.project.id));
});
seoRoutes.delete("/competitors/:id", async (req, res) => {
  await seo.removeCompetitor(
    res.locals.user.id,
    res.locals.project.id,
    String(req.params.id),
  );
  res.json(
    await seo.listCompetitors(res.locals.user.id, res.locals.project.id),
  );
});
seoRoutes.get("/seo/jobs", async (req, res) =>
  res.json(
    await jobs.listSeoJobs(
      res.locals.user.id,
      res.locals.project.id,
      jobs.validKind(req.query.kind),
    ),
  ),
);
seoRoutes.get("/seo/jobs/:id", async (req, res) => {
  const job = await jobs.getSeoJob(
    res.locals.user.id,
    res.locals.project.id,
    String(req.params.id),
  );
  if (!job)
    return res.status(404).json({ error: "Research report not found." });
  res.json(job);
});
seoRoutes.post("/seo/jobs", async (req, res) => {
  const job = await jobs.enqueueSeo(
    res.locals.user.id,
    res.locals.project,
    req.body.kind,
    req.body,
  );
  if (["queued", "running"].includes(job.status)) {
    const { dispatchSeo } = await import("./dispatch");
    await dispatchSeo(job.id);
  }
  res.status(["queued", "running"].includes(job.status) ? 202 : 200).json(job);
});
seoRoutes.post("/seo/jobs/:id/cancel", async (req, res) => {
  const job = await jobs.cancelSeo(
    res.locals.user.id,
    res.locals.project.id,
    String(req.params.id),
  );
  if (!job)
    return res.status(404).json({ error: "Research report not found." });
  res.json(job);
});

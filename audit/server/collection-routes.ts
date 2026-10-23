import { Router } from "express";
import {
  collectionState,
  collectedLinks,
  collectedPages,
  saveSource,
  sources,
  pageOffset,
} from "./collection";
import { enqueue } from "./jobs";
import { seoDomain } from "./seo-provider";
import { limits } from "./config";
export const collectionRoutes = Router();
// This router is mounted after session authentication and project ownership.
collectionRoutes.get("/collection", async (_req, res) =>
  res.json(await collectionState(res.locals.user.id, res.locals.project.id)),
);
collectionRoutes.post("/collection/sources", async (req, res) => {
  await saveSource(res.locals.user.id, res.locals.project.id, req.body.url);
  res
    .status(201)
    .json(await sources(res.locals.user.id, res.locals.project.id));
});
collectionRoutes.post("/collection/jobs", async (req, res) => {
  const job = await enqueue(
    res.locals.user.id,
    res.locals.project,
    Number(req.body.pageLimit ?? limits.pages),
    new Date(),
    seoDomain(req.body.domain),
  );
  const { dispatchJob } = await import("./dispatch");
  await dispatchJob(job.id);
  res.status(202).json(job);
});
collectionRoutes.get("/collection/links", async (req, res) =>
  res.json(
    await collectedLinks(
      res.locals.user.id,
      res.locals.project.id,
      req.query.state ?? "present",
      pageOffset(req.query.offset),
    ),
  ),
);
collectionRoutes.get("/collection/pages", async (req, res) =>
  res.json(
    await collectedPages(
      res.locals.user.id,
      res.locals.project.id,
      seoDomain(req.query.domain),
      pageOffset(req.query.offset),
    ),
  ),
);

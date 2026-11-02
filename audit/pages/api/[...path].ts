import type { NextApiRequest, NextApiResponse } from "next";
export const config = {
  api: { bodyParser: false, externalResolver: true },
  maxDuration: 300,
};
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { app } = await import("../../server/app");
  await new Promise<void>((resolve) => {
    res.once("finish", resolve);
    res.once("close", resolve);
    app(req, res);
  });
}

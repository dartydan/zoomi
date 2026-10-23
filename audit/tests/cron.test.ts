import { test } from "node:test";
import assert from "node:assert/strict";
import recover from "../pages/api/recover-jobs";
import type { NextApiRequest, NextApiResponse } from "next";
test("background scheduling rejects missing, incorrect and wrong-method credentials before loading workers", async () => {
  const original = process.env.CRON_SECRET;
  try {
    process.env.CRON_SECRET = "test-only-scheduler-key";
    for (const [method, authorization] of [
      ["GET", ""],
      ["GET", "Bearer wrong"],
      ["GET", "Bearer test-only-scheduler-keX"],
      ["POST", "Bearer test-only-scheduler-key"],
    ]) {
      let status = 0;
      let ended = false;
      const res = {
        status(code: number) {
          status = code;
          return this;
        },
        end() {
          ended = true;
        },
      } as unknown as NextApiResponse;
      await recover(
        { method, headers: { authorization } } as NextApiRequest,
        res,
      );
      assert.equal(status, 401);
      assert.equal(ended, true);
    }
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextOccurrence,
  validRecurrence,
  type Recurrence,
} from "../server/recurrence";
const schedule: Recurrence = {
  frequency: "daily",
  timezone: "America/New_York",
  hour: 9,
  weekday: 1,
};
test("schedules use the customer timezone and strictly advance after the due time", () => {
  assert.equal(
    nextOccurrence(schedule, new Date("2026-01-05T13:59:00Z")),
    "2026-01-05T14:00:00.000Z",
  );
  assert.equal(
    nextOccurrence(schedule, new Date("2026-01-05T14:00:00Z")),
    "2026-01-06T14:00:00.000Z",
  );
  assert.equal(
    nextOccurrence(
      { ...schedule, timezone: "Asia/Kathmandu" },
      new Date("2026-01-05T00:00:00Z"),
    ),
    "2026-01-05T03:15:00.000Z",
  );
  assert.equal(nextOccurrence({ ...schedule, frequency: "off" }), null);
});
test("weekly and monthly schedules handle month and year boundaries", () => {
  assert.equal(
    nextOccurrence(
      { ...schedule, frequency: "weekly" },
      new Date("2026-01-05T14:00:00Z"),
    ),
    "2026-01-12T14:00:00.000Z",
  );
  assert.equal(
    nextOccurrence(
      { ...schedule, frequency: "monthly" },
      new Date("2026-12-31T22:00:00Z"),
    ),
    "2027-01-01T14:00:00.000Z",
  );
  assert.equal(
    nextOccurrence(
      { ...schedule, frequency: "monthly" },
      new Date("2026-02-01T15:00:00Z"),
    ),
    "2026-03-01T14:00:00.000Z",
  );
});
test("daylight saving skips a missing hour and does not repeat a fall-back run", () => {
  const spring = { ...schedule, hour: 2 };
  assert.equal(
    nextOccurrence(spring, new Date("2026-03-08T05:00:00Z")),
    "2026-03-08T07:00:00.000Z",
  );
  assert.equal(
    nextOccurrence(spring, new Date("2026-03-08T07:00:00Z")),
    "2026-03-09T06:00:00.000Z",
  );
  const fall = { ...schedule, hour: 1 };
  assert.equal(
    nextOccurrence(fall, new Date("2026-11-01T04:00:00Z")),
    "2026-11-01T05:00:00.000Z",
  );
  assert.equal(
    nextOccurrence(fall, new Date("2026-11-01T05:00:00Z")),
    "2026-11-02T06:00:00.000Z",
  );
});
test("invalid schedule preferences are rejected", () => {
  for (const invalid of [
    null,
    {},
    { ...schedule, timezone: "Mars/Olympus" },
    { ...schedule, hour: 24 },
    { ...schedule, weekday: -1 },
    { ...schedule, frequency: "hourly" },
    { ...schedule, frequency: ["daily"] },
  ])
    assert.throws(() => validRecurrence(invalid));
});

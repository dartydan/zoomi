export type Frequency = "off" | "daily" | "weekly" | "monthly";
export interface Recurrence {
  frequency: Frequency;
  timezone: string;
  hour: number;
  weekday: number;
}
export function validRecurrence(value: unknown): Recurrence {
  if (!value || typeof value !== "object")
    throw new Error("Choose when this should run.");
  const x = value as Record<string, unknown>;
  if (
    typeof x.frequency !== "string" ||
    !["off", "daily", "weekly", "monthly"].includes(x.frequency) ||
    typeof x.timezone !== "string" ||
    x.timezone.length > 80 ||
    !Number.isInteger(x.hour) ||
    Number(x.hour) < 0 ||
    Number(x.hour) > 23 ||
    !Number.isInteger(x.weekday) ||
    Number(x.weekday) < 0 ||
    Number(x.weekday) > 6
  )
    throw new Error("Choose a valid frequency, time and timezone.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: x.timezone }).format();
  } catch {
    throw new Error("Choose a valid timezone.");
  }
  return {
    frequency: x.frequency as Frequency,
    timezone: x.timezone,
    hour: Number(x.hour),
    weekday: Number(x.weekday),
  };
}
function localParts(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return {
    year: n("year"),
    month: n("month"),
    day: n("day"),
    hour: n("hour"),
    minute: n("minute"),
  };
}
function localTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  timezone: string,
) {
  const target = Date.UTC(year, month - 1, day, hour);
  let guess = target;
  // Resolve the UTC offset at this local date, including daylight-saving changes.
  for (let i = 0; i < 4; i++) {
    const p = localParts(new Date(guess), timezone);
    const next =
      guess + target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    if (next === guess) return new Date(guess);
    guess = next;
  }
  // For a skipped spring-forward hour, run at the first later local time that day.
  for (let t = target - 15 * 3600000; t <= target + 15 * 3600000; t += 60000) {
    const p = localParts(new Date(t), timezone);
    if (p.year === year && p.month === month && p.day === day && p.hour >= hour)
      return new Date(t);
  }
  throw new Error("Could not calculate the next run.");
}
export function nextOccurrence(
  config: Recurrence,
  after = new Date(),
): string | null {
  if (config.frequency === "off") return null;
  const p = localParts(after, config.timezone);
  for (let offset = 0; offset <= 35; offset++) {
    const day = new Date(Date.UTC(p.year, p.month - 1, p.day + offset));
    if (config.frequency === "weekly" && day.getUTCDay() !== config.weekday)
      continue;
    if (config.frequency === "monthly" && day.getUTCDate() !== 1) continue;
    const candidate = localTime(
      day.getUTCFullYear(),
      day.getUTCMonth() + 1,
      day.getUTCDate(),
      config.hour,
      config.timezone,
    );
    if (candidate > after) return candidate.toISOString();
  }
  throw new Error("Could not calculate the next run.");
}

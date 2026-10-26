import { PROGRAM_TIME_ZONE } from "./dates";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: PROGRAM_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function zonedParts(d: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year!, m: +p.month!, d: +p.day!, h: +p.hour!, mi: +p.minute!, s: +p.second! };
}

/** Offset (ms) of the program time zone from UTC at instant `d` (e.g. -5h for EST). */
function offsetAt(d: Date): number {
  const z = zonedParts(d);
  return Date.UTC(z.y, z.m - 1, z.d, z.h, z.mi, z.s) - Math.floor(d.getTime() / 1000) * 1000;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/**
 * The UTC instant of a wall-clock time in the program time zone. "2027-03-14" "02:30"
 * (a time that does not exist on the spring-forward day) resolves to 03:30 EDT.
 * Returns null for malformed input.
 */
export function zonedToUtc(date: string, time = "00:00"): Date | null {
  const dm = DATE_RE.exec(date);
  const tm = TIME_RE.exec(time);
  if (!dm || !tm) return null;
  const [y, mo, d, h, mi] = [+dm[1]!, +dm[2]!, +dm[3]!, +tm[1]!, +tm[2]!];
  if (y < 2000 || y > 2100) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(wall);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null; // e.g. Feb 30
  // Two passes settle the offset across DST transitions.
  const first = wall - offsetAt(new Date(wall));
  const second = wall - offsetAt(new Date(first));
  // A wall time inside the spring-forward gap (e.g. 02:30) does not exist; neither guess
  // round-trips, and the later instant is the one that reads as the next valid time.
  const roundTrips = (t: number) => offsetAt(new Date(t)) + t === wall;
  if (roundTrips(second)) return new Date(second);
  if (roundTrips(first)) return new Date(first);
  return new Date(Math.max(first, second));
}

/** The exclusive deadline instant for "submit by the end of <date>" (midnight starting the next day). */
export function endOfDayDeadline(date: string): Date | null {
  const dm = DATE_RE.exec(date);
  if (!dm) return null;
  const next = new Date(Date.UTC(+dm[1]!, +dm[2]! - 1, +dm[3]! + 1));
  const iso = next.toISOString().slice(0, 10);
  return zonedToUtc(date) && zonedToUtc(iso, "00:00");
}

/** "YYYY-MM-DD" of instant `d` in the program time zone (for <input type="date">). */
export function toZonedDateInput(d: Date): string {
  const z = zonedParts(d);
  return `${z.y}-${String(z.m).padStart(2, "0")}-${String(z.d).padStart(2, "0")}`;
}

/** "HH:MM" of instant `d` in the program time zone (for <input type="time">). */
export function toZonedTimeInput(d: Date): string {
  const z = zonedParts(d);
  return `${String(z.h).padStart(2, "0")}:${String(z.mi).padStart(2, "0")}`;
}

/** The date input for an exclusive end-of-day deadline: the calendar day before it. */
export function deadlineToDateInput(exclusive: Date): string {
  return toZonedDateInput(new Date(exclusive.getTime() - 1));
}

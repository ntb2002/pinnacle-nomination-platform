/**
 * All times are stored in UTC and shown in the program's time zone (Syracuse, NY).
 * Deadlines are exclusive instants ("midnight at the end of Feb 26" is stored as
 * 2027-02-27T05:00Z), so for display we show the last moment of the named day.
 */
export const PROGRAM_TIME_ZONE = "America/New_York";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: PROGRAM_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const shortDateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: PROGRAM_TIME_ZONE,
  month: "long",
  day: "numeric",
  year: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: PROGRAM_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

/** "Tuesday, January 26, 2027" */
export const formatDate = (d: Date) => dateFmt.format(d);
/** "January 26, 2027" */
export const formatShortDate = (d: Date) => shortDateFmt.format(d);
/** "Jan 26, 2027, 9:00 AM EST" */
export const formatDateTime = (d: Date) => dateTimeFmt.format(d);

/** The calendar day a deadline closes on: the instant minus one millisecond. */
export const deadlineDay = (exclusiveDeadline: Date) => new Date(exclusiveDeadline.getTime() - 1);

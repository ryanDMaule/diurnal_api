import {
  isValidPublicationDate,
  PUBLICATION_TIMEZONE
} from "./publications.js";

function calendarDateInTimezone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function createPublicationDateResolver({
  dateOverride = process.env.DIURNUS_DATE_OVERRIDE,
  now = () => new Date()
} = {}) {
  if (dateOverride !== undefined && !isValidPublicationDate(dateOverride)) {
    throw new Error(
      "DIURNUS_DATE_OVERRIDE must be a real calendar date in YYYY-MM-DD format."
    );
  }

  return () =>
    dateOverride ?? calendarDateInTimezone(now(), PUBLICATION_TIMEZONE);
}

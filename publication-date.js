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
  nodeEnv = process.env.NODE_ENV,
  now = () => new Date()
} = {}) {
  if (nodeEnv === "production" && dateOverride !== undefined) {
    throw new Error(
      "DIURNUS_DATE_OVERRIDE must not be configured when NODE_ENV=production."
    );
  }

  if (dateOverride !== undefined && !isValidPublicationDate(dateOverride)) {
    throw new Error(
      "DIURNUS_DATE_OVERRIDE must be a real calendar date in YYYY-MM-DD format."
    );
  }

  return () =>
    dateOverride ?? calendarDateInTimezone(now(), PUBLICATION_TIMEZONE);
}

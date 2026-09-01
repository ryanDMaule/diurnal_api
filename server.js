import express from "express";
import cors from "cors";
import {
  isValidPublicationDate,
  publications,
  PUBLICATION_TIMEZONE,
  validatePublications
} from "./publications.js";

validatePublications(publications);

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

const publicationDateOverride = process.env.DIURNUS_DATE_OVERRIDE;
if (
  publicationDateOverride !== undefined &&
  !isValidPublicationDate(publicationDateOverride)
) {
  throw new Error(
    "DIURNUS_DATE_OVERRIDE must be a real calendar date in YYYY-MM-DD format."
  );
}

function resolvePublicationDate() {
  if (publicationDateOverride !== undefined) return publicationDateOverride;
  return calendarDateInTimezone(new Date(), PUBLICATION_TIMEZONE);
}

const app = express();
app.use(cors());

// ✅ Root route (must come before 404 handler)
app.get("/", (req, res) => {
  res.send("🌞 Diurnal API is running! Try /word");
});

app.get("/word", (req, res) => {
  const resolvedPublicationDate = resolvePublicationDate();
  const publication = publications.find(
    ({ publicationDate }) => publicationDate === resolvedPublicationDate
  );

  if (!publication) {
    return res.status(404).json({
      error: "No publication scheduled for this date.",
      code: "PUBLICATION_NOT_FOUND",
      publicationDate: resolvedPublicationDate
    });
  }

  res.json(publication);
});

// ✅ This must be *last* — handles unknown routes
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Diurnal API running on port ${PORT}`);
});

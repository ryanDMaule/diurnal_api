export const PUBLICATION_TIMEZONE = "Europe/London";

// DEVELOPMENT DATA ONLY.
// This fixture schedule exists so the API can be developed before launch. It may
// be reset before the permanent production publication history is established.
// Once production publishing begins, publication IDs, sequences, and dates are
// immutable and new records must only be appended.
export const publications = [
  {
    id: "7f354323-2ee8-49f8-ba56-6df7e85d4b46",
    sequence: 1,
    publicationDate: "2026-09-01",
    word: "Diurnal",
    type: "Adjective",
    phonetic: "di·​ur·​nal",
    definition:
      "Occurring or active during the daytime; relating to or happening once every day.",
    usage:
      "Unlike nocturnal creatures, diurnal animals such as squirrels and hawks are active during the day.",
    synonyms: ["Daily", "Daytime", "Circadian"]
  }
];

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const REQUIRED_WORD_FIELDS = [
  "word",
  "type",
  "phonetic",
  "definition",
  "usage"
];

export function isValidPublicationDate(value) {
  if (typeof value !== "string") return false;

  const match = DATE_PATTERN.exec(value);
  if (!match) return false;

  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validatePublications(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Publication dataset must be a non-empty array.");
  }

  const ids = new Set();
  const sequences = new Set();
  const publicationDates = new Set();

  for (const publication of records) {
    const label = `Publication sequence ${publication?.sequence ?? "unknown"}`;

    if (typeof publication?.id !== "string" || !publication.id.trim()) {
      throw new Error(`${label} must have a non-empty id.`);
    }
    if (ids.has(publication.id)) {
      throw new Error(`Duplicate publication id: ${publication.id}.`);
    }
    ids.add(publication.id);

    if (!Number.isInteger(publication.sequence) || publication.sequence < 1) {
      throw new Error(`${label} must have a positive integer sequence.`);
    }
    if (sequences.has(publication.sequence)) {
      throw new Error(`Duplicate publication sequence: ${publication.sequence}.`);
    }
    sequences.add(publication.sequence);

    if (!isValidPublicationDate(publication.publicationDate)) {
      throw new Error(
        `${label} has an invalid publicationDate; expected a real YYYY-MM-DD date.`
      );
    }
    if (publicationDates.has(publication.publicationDate)) {
      throw new Error(
        `Duplicate publication date: ${publication.publicationDate}.`
      );
    }
    publicationDates.add(publication.publicationDate);

    for (const field of REQUIRED_WORD_FIELDS) {
      if (typeof publication[field] !== "string" || !publication[field].trim()) {
        throw new Error(`${label} must have a non-empty ${field}.`);
      }
    }

    if (
      !Array.isArray(publication.synonyms) ||
      publication.synonyms.length === 0 ||
      publication.synonyms.some(
        (synonym) => typeof synonym !== "string" || !synonym.trim()
      )
    ) {
      throw new Error(`${label} must have a non-empty array of synonyms.`);
    }
  }

  const orderedSequences = [...sequences].sort((a, b) => a - b);
  orderedSequences.forEach((sequence, index) => {
    const expected = index + 1;
    if (sequence !== expected) {
      throw new Error(
        `Publication sequences must be consecutive from 1; expected ${expected}, found ${sequence}.`
      );
    }
  });
}

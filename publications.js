import { readFileSync } from "node:fs";

export const PUBLICATION_TIMEZONE = "Europe/London";
export const CATALOGUE_GENERATION = "diurnus-canonical-2026-10-16-v1";
export const CATALOGUE_GENERATION_HEADER = "X-Diurnus-Catalogue-Generation";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const REQUIRED_WORD_FIELDS = [
  "word",
  "type",
  "phonetic",
  "definition",
  "usage"
];
const PUBLICATION_FIELDS = [
  "id",
  "sequence",
  "publicationDate",
  ...REQUIRED_WORD_FIELDS,
  "synonyms"
];

const canonicalRecords = JSON.parse(
  readFileSync(new URL("./data/publications.json", import.meta.url), "utf8")
);
const wordIdentityRecords = JSON.parse(
  readFileSync(
    new URL("./data/migration_preview/word_identity_map.json", import.meta.url),
    "utf8"
  )
);

validateCanonicalPublications(canonicalRecords, wordIdentityRecords);

// wordId remains an internal editorial identity. Public endpoint objects retain
// the established nine-field publication response contract.
export const publications = canonicalRecords.map((record) =>
  Object.freeze(
    Object.fromEntries(PUBLICATION_FIELDS.map((field) => [field, record[field]]))
  )
);

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
  validatePublicationRecords(records, { requireWordIds: false });
}

function validateCanonicalPublications(records, identityRecords) {
  validatePublicationRecords(records, { requireWordIds: true });

  if (!Array.isArray(identityRecords) || identityRecords.length !== records.length) {
    throw new Error("Word identity map must match the publication count.");
  }

  const identityByWord = new Map();
  for (const identity of identityRecords) {
    if (!UUID_PATTERN.test(identity?.wordId) || !identity?.word?.trim()) {
      throw new Error("Word identity map contains an invalid record.");
    }
    const spelling = identity.word.trim().toLocaleLowerCase("en");
    if (identityByWord.has(spelling)) {
      throw new Error(`Duplicate identity-map word spelling: ${identity.word}.`);
    }
    identityByWord.set(spelling, identity.wordId);
  }

  for (const publication of records) {
    const expectedWordId = identityByWord.get(
      publication.word.trim().toLocaleLowerCase("en")
    );
    if (publication.wordId !== expectedWordId) {
      throw new Error(
        `Publication sequence ${publication.sequence} does not match its persisted wordId.`
      );
    }
  }
}

function validatePublicationRecords(records, { requireWordIds }) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Publication dataset must be a non-empty array.");
  }

  const ids = new Set();
  const wordIds = new Set();
  const sequences = new Set();
  const publicationDates = new Set();
  const wordSpellings = new Set();

  for (const [index, publication] of records.entries()) {
    const label = `Publication sequence ${publication?.sequence ?? "unknown"}`;

    if (!UUID_PATTERN.test(publication?.id)) {
      throw new Error(`${label} must have a valid UUID id.`);
    }
    if (ids.has(publication.id)) {
      throw new Error(`Duplicate publication id: ${publication.id}.`);
    }
    ids.add(publication.id);

    if (requireWordIds) {
      if (!UUID_PATTERN.test(publication?.wordId)) {
        throw new Error(`${label} must have a valid UUID wordId.`);
      }
      if (wordIds.has(publication.wordId)) {
        throw new Error(`Duplicate publication wordId: ${publication.wordId}.`);
      }
      wordIds.add(publication.wordId);
    }

    if (!Number.isInteger(publication.sequence) || publication.sequence < 1) {
      throw new Error(`${label} must have a positive integer sequence.`);
    }
    if (sequences.has(publication.sequence)) {
      throw new Error(`Duplicate publication sequence: ${publication.sequence}.`);
    }
    sequences.add(publication.sequence);

    const expectedSequence = index + 1;
    if (publication.sequence !== expectedSequence) {
      throw new Error(
        `Publication records must be ordered consecutively from 1; expected sequence ${expectedSequence}, found ${publication.sequence}.`
      );
    }

    if (!isValidPublicationDate(publication.publicationDate)) {
      throw new Error(
        `${label} has an invalid publicationDate; expected a real YYYY-MM-DD date.`
      );
    }
    if (publicationDates.has(publication.publicationDate)) {
      throw new Error(`Duplicate publication date: ${publication.publicationDate}.`);
    }
    publicationDates.add(publication.publicationDate);

    if (index > 0) {
      const previousDate = records[index - 1].publicationDate;
      const interval =
        Date.parse(`${publication.publicationDate}T00:00:00Z`) -
        Date.parse(`${previousDate}T00:00:00Z`);
      if (interval !== ONE_DAY_IN_MS) {
        throw new Error(
          `${label} must be dated exactly one calendar day after the previous publication.`
        );
      }
    }

    for (const field of REQUIRED_WORD_FIELDS) {
      if (typeof publication[field] !== "string" || !publication[field].trim()) {
        throw new Error(`${label} must have a non-empty ${field}.`);
      }
    }

    const spelling = publication.word.trim().toLocaleLowerCase("en");
    if (wordSpellings.has(spelling)) {
      throw new Error(`Duplicate publication word spelling: ${publication.word}.`);
    }
    wordSpellings.add(spelling);

    if (
      !Array.isArray(publication.synonyms) ||
      publication.synonyms.length > 3 ||
      publication.synonyms.some(
        (synonym) => typeof synonym !== "string" || !synonym.trim()
      )
    ) {
      throw new Error(
        `${label} must have an array of at most three non-empty synonyms.`
      );
    }
  }

  if (requireWordIds) {
    for (const id of ids) {
      if (wordIds.has(id)) {
        throw new Error(`Publication id collides with a wordId: ${id}.`);
      }
    }
  }
}

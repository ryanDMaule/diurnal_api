import { randomUUID, createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const PREVIEW_DIRECTORY = "data/migration_preview";
export const LEDGER_PATH = `${PREVIEW_DIRECTORY}/publications_2027_preview.json`;
export const IDENTITY_PATH = `${PREVIEW_DIRECTORY}/word_identity_map.json`;
export const BASELINE_PATH = `${PREVIEW_DIRECTORY}/runtime_integrity_baseline.json`;
export const MASTER_PATH = "data/words_master.json";
export const ORDER_PATH = "data/words_publication.json";
export const LAUNCH_DATE = "2027-01-01";
export const FINAL_DATE = "2029-02-25";
export const PUBLICATION_COUNT = 787;
export const EDITORIAL_FIELDS = [
  "word",
  "type",
  "phonetic",
  "definition",
  "usage",
  "synonyms"
];
export const PROTECTED_RUNTIME_FILES = [
  "publications.js",
  "dictionary.js",
  "publication-date.js",
  "app.js",
  "server.js"
];

const PUBLICATION_FIELDS = [
  "id",
  "sequence",
  "publicationDate",
  "wordId",
  ...EDITORIAL_FIELDS
];
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function normalisedWord(word) {
  return word.normalize("NFKC").trim().toLocaleLowerCase("en");
}

function dateAt(index) {
  const date = new Date(Date.UTC(2027, 0, 1));
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

function editorialSnapshot(record) {
  return Object.fromEntries(EDITORIAL_FIELDS.map((field) => [field, record[field]]));
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export async function currentRuntimeHashes() {
  return Object.fromEntries(
    await Promise.all(
      PROTECTED_RUNTIME_FILES.map(async (filePath) => [filePath, await sha256(filePath)])
    )
  );
}

export async function loadPreviewInputs() {
  const [master, order] = await Promise.all([
    readJson(MASTER_PATH),
    readJson(ORDER_PATH)
  ]);
  return { master, order };
}

function validateEditorialInputs(master, order) {
  if (master.length !== PUBLICATION_COUNT || order.length !== PUBLICATION_COUNT) {
    throw new Error("Editorial inputs must each contain exactly 787 records.");
  }
  const masterByWord = new Map();
  for (const record of master) {
    if (!sameValue(Object.keys(record), EDITORIAL_FIELDS)) {
      throw new Error(`${record.word ?? "Unknown word"} has an unexpected editorial schema.`);
    }
    const key = normalisedWord(record.word);
    if (masterByWord.has(key)) throw new Error(`Duplicate master word: ${record.word}.`);
    masterByWord.set(key, record);
  }
  for (const record of order) {
    const masterRecord = masterByWord.get(normalisedWord(record.word));
    if (!masterRecord || !sameValue(record, masterRecord)) {
      throw new Error(`${record.word} does not match the master editorial record.`);
    }
  }
  if (normalisedWord(order[0].word) !== "diurnal") {
    throw new Error("Diurnal must be first in the publication order.");
  }
  return masterByWord;
}

export function validatePreviewData({ master, order, identityMap, ledger }) {
  const masterByWord = validateEditorialInputs(master, order);
  if (!Array.isArray(identityMap) || identityMap.length !== PUBLICATION_COUNT) {
    throw new Error("Identity map must contain exactly 787 records.");
  }
  if (!Array.isArray(ledger) || ledger.length !== PUBLICATION_COUNT) {
    throw new Error("Preview ledger must contain exactly 787 records.");
  }

  const wordIds = new Set();
  const identityByWord = new Map();
  for (const identity of identityMap) {
    if (!sameValue(Object.keys(identity), ["wordId", "word"])) {
      throw new Error("Identity map entries must contain only wordId and word.");
    }
    if (!UUID_V4_PATTERN.test(identity.wordId)) {
      throw new Error(`${identity.word} has an invalid UUIDv4 wordId.`);
    }
    if (wordIds.has(identity.wordId)) throw new Error(`Duplicate wordId: ${identity.wordId}.`);
    const key = normalisedWord(identity.word);
    if (identityByWord.has(key)) throw new Error(`Duplicate identity word: ${identity.word}.`);
    if (!masterByWord.has(key)) throw new Error(`Identity word is not in master: ${identity.word}.`);
    wordIds.add(identity.wordId);
    identityByWord.set(key, identity);
  }

  const publicationIds = new Set();
  const sequences = new Set();
  const dates = new Set();
  ledger.forEach((publication, index) => {
    if (!sameValue(Object.keys(publication), PUBLICATION_FIELDS)) {
      throw new Error(`Sequence ${publication.sequence} has an unexpected publication schema.`);
    }
    if (!UUID_V4_PATTERN.test(publication.id)) {
      throw new Error(`Sequence ${publication.sequence} has an invalid UUIDv4 id.`);
    }
    if (publicationIds.has(publication.id)) throw new Error(`Duplicate publication id: ${publication.id}.`);
    if (wordIds.has(publication.id)) throw new Error(`Publication id collides with a wordId: ${publication.id}.`);
    if (sequences.has(publication.sequence)) throw new Error(`Duplicate sequence: ${publication.sequence}.`);
    if (dates.has(publication.publicationDate)) throw new Error(`Duplicate date: ${publication.publicationDate}.`);

    const expectedSequence = index + 1;
    const expectedDate = dateAt(index);
    const orderedWord = order[index];
    const identity = identityByWord.get(normalisedWord(orderedWord.word));
    if (publication.sequence !== expectedSequence) {
      throw new Error(`Expected sequence ${expectedSequence}, found ${publication.sequence}.`);
    }
    if (publication.publicationDate !== expectedDate) {
      throw new Error(`Sequence ${expectedSequence} must be dated ${expectedDate}.`);
    }
    if (publication.wordId !== identity.wordId) {
      throw new Error(`Sequence ${expectedSequence} has the wrong wordId.`);
    }
    if (!sameValue(editorialSnapshot(publication), orderedWord)) {
      throw new Error(`Sequence ${expectedSequence} snapshot differs from ${orderedWord.word}.`);
    }

    publicationIds.add(publication.id);
    sequences.add(publication.sequence);
    dates.add(publication.publicationDate);
  });

  if (ledger[0].publicationDate !== LAUNCH_DATE || ledger.at(-1).publicationDate !== FINAL_DATE) {
    throw new Error("Preview date boundaries are incorrect.");
  }

  return {
    publications: ledger.length,
    uniquePublicationIds: publicationIds.size,
    uniqueWordIds: wordIds.size,
    uniqueSequences: sequences.size,
    uniqueDates: dates.size,
    firstSequence: ledger[0].sequence,
    finalSequence: ledger.at(-1).sequence,
    firstDate: ledger[0].publicationDate,
    finalDate: ledger.at(-1).publicationDate,
    firstWord: ledger[0].word,
    finalWord: ledger.at(-1).word
  };
}

export async function validateRuntimeBaseline(baseline) {
  if (baseline.algorithm !== "SHA-256") throw new Error("Unsupported baseline hash algorithm.");
  const current = await currentRuntimeHashes();
  if (!sameValue(current, baseline.files)) {
    throw new Error("A protected API runtime file differs from the preview baseline.");
  }
  return current;
}

export async function generateOrValidatePreview() {
  const presence = await Promise.all(
    [LEDGER_PATH, IDENTITY_PATH, BASELINE_PATH].map(exists)
  );
  const existingCount = presence.filter(Boolean).length;
  if (existingCount !== 0 && existingCount !== presence.length) {
    throw new Error("Partial preview artifacts exist; refusing to overwrite or regenerate identities.");
  }

  const { master, order } = await loadPreviewInputs();
  if (existingCount === presence.length) {
    const [ledger, identityMap] = await Promise.all([
      readJson(LEDGER_PATH),
      readJson(IDENTITY_PATH)
    ]);
    return {
      mode: "reused",
      result: validatePreviewData({ master, order, identityMap, ledger })
    };
  }

  validateEditorialInputs(master, order);
  const identityMap = master.map(({ word }) => ({ wordId: randomUUID(), word }));
  const identityByWord = new Map(
    identityMap.map((identity) => [normalisedWord(identity.word), identity.wordId])
  );
  const ledger = order.map((record, index) => ({
    id: randomUUID(),
    sequence: index + 1,
    publicationDate: dateAt(index),
    wordId: identityByWord.get(normalisedWord(record.word)),
    ...editorialSnapshot(record)
  }));
  const result = validatePreviewData({ master, order, identityMap, ledger });
  const baseline = {
    algorithm: "SHA-256",
    files: await currentRuntimeHashes()
  };

  await mkdir(PREVIEW_DIRECTORY, { recursive: true });
  await Promise.all([
    writeJson(IDENTITY_PATH, identityMap),
    writeJson(LEDGER_PATH, ledger),
    writeJson(BASELINE_PATH, baseline)
  ]);
  return { mode: "created", result };
}

export async function loadAndValidatePreview() {
  const [{ master, order }, ledger, identityMap] = await Promise.all([
    loadPreviewInputs(),
    readJson(LEDGER_PATH),
    readJson(IDENTITY_PATH)
  ]);
  return validatePreviewData({ master, order, identityMap, ledger });
}

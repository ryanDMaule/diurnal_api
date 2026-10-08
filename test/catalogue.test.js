import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FIELDS,
  loadSource,
  MASTER_PATH,
  parseRawCatalogue,
  PUBLICATION_PATH,
  readJson,
  SHUFFLE_SEED,
  shuffleRecords,
  validateRecords,
  verifyIntegrity
} from "../scripts/catalogue-tools.js";

test("raw catalogue parsing fully reconciles every source record", async () => {
  const result = parseRawCatalogue(await loadSource());

  assert.equal(result.sourceRecordCount, 787);
  assert.equal(result.records.length, 787);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.records.find(({ word }) => word === "Tatterdemalion")?.synonyms,
    ["ragamuffin"]
  );
});

test("master catalogue uses the exact six-field schema", async () => {
  const master = await readJson(MASTER_PATH);
  const parseResult = parseRawCatalogue(await loadSource());
  const validation = validateRecords(master, parseResult.locations);

  assert.equal(
    validation.issues.filter(({ level }) => level === "blocking").length,
    0
  );
  for (const record of master) assert.deepEqual(Object.keys(record), FIELDS);
});

test("publication catalogue is metadata-identical and reproducible", async () => {
  const master = await readJson(MASTER_PATH);
  const publication = await readJson(PUBLICATION_PATH);
  const parsed = parseRawCatalogue(await loadSource());
  const integrity = verifyIntegrity(
    master,
    publication,
    parsed.records,
    parsed.sourceRecordCount
  );

  assert.equal(integrity.checks.equalRecordCounts, true);
  assert.equal(integrity.checks.identicalMetadata, true);
  assert.equal(integrity.checks.masterMatchesParsedSource, true);
  assert.equal(integrity.checks.diurnalFirst, true);
  assert.equal(integrity.checks.reproducibleShuffle, true);
  assert.equal(integrity.checks.sourceReconciled, true);
  assert.deepEqual(publication, shuffleRecords(master, SHUFFLE_SEED));
});

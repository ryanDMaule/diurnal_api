import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  FINAL_DATE,
  generateOrValidatePreview,
  IDENTITY_PATH,
  LAUNCH_DATE,
  LEDGER_PATH,
  loadAndValidatePreview,
  PUBLICATION_COUNT
} from "../scripts/preview/migration-preview-tools.js";

async function hash(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

test("preview ledger satisfies canonical count, identity, order, and date rules", async () => {
  const result = await loadAndValidatePreview();

  assert.equal(result.publications, PUBLICATION_COUNT);
  assert.equal(result.uniquePublicationIds, PUBLICATION_COUNT);
  assert.equal(result.uniqueWordIds, PUBLICATION_COUNT);
  assert.equal(result.uniqueSequences, PUBLICATION_COUNT);
  assert.equal(result.uniqueDates, PUBLICATION_COUNT);
  assert.equal(result.firstSequence, 1);
  assert.equal(result.finalSequence, 787);
  assert.equal(result.firstDate, LAUNCH_DATE);
  assert.equal(result.finalDate, FINAL_DATE);
  assert.equal(result.firstWord, "Diurnal");
});

test("preview reruns reuse persisted identities without rewriting artifacts", async () => {
  const before = {
    ledger: await hash(LEDGER_PATH),
    identities: await hash(IDENTITY_PATH)
  };
  const result = await generateOrValidatePreview();
  const after = {
    ledger: await hash(LEDGER_PATH),
    identities: await hash(IDENTITY_PATH)
  };

  assert.equal(result.mode, "reused");
  assert.deepEqual(after, before);
});

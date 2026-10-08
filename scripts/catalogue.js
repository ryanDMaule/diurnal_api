import {
  createReport,
  loadSource,
  MASTER_PATH,
  parseRawCatalogue,
  PUBLICATION_PATH,
  readJson,
  REPORT_PATH,
  shuffleRecords,
  validateRecords,
  verifyIntegrity,
  writeJson,
  writeReport
} from "./catalogue-tools.js";

const command = process.argv[2] ?? "build";

async function sourceAnalysis() {
  const parseResult = parseRawCatalogue(await loadSource());
  const validation = validateRecords(parseResult.records, parseResult.locations);
  return { parseResult, validation };
}

async function parse() {
  const { parseResult } = await sourceAnalysis();
  await writeJson(MASTER_PATH, parseResult.records);
  console.log(`Parsed ${parseResult.records.length} records into ${MASTER_PATH}.`);
  return parseResult;
}

async function validate() {
  const { parseResult } = await sourceAnalysis();
  const master = await readJson(MASTER_PATH);
  const validation = validateRecords(master, parseResult.locations);
  const blocking =
    parseResult.errors.length +
    validation.issues.filter(({ level }) => level === "blocking").length +
    (JSON.stringify(master) === JSON.stringify(parseResult.records) ? 0 : 1);
  const editorial = new Set(
    validation.issues
      .filter(({ level }) => level === "editorial")
      .map(({ recordIndex }) => recordIndex)
  ).size;
  console.log(
    `Validated ${parseResult.records.length} records: ${blocking} blocking errors, ${editorial} records requiring editorial review.`
  );
  if (blocking > 0) process.exitCode = 1;
  return { parseResult, validation };
}

async function shuffle() {
  const master = await readJson(MASTER_PATH);
  const publication = shuffleRecords(master);
  await writeJson(PUBLICATION_PATH, publication);
  console.log(`Wrote ${publication.length} shuffled records to ${PUBLICATION_PATH}.`);
  return publication;
}

async function verify() {
  const { parseResult } = await sourceAnalysis();
  const master = await readJson(MASTER_PATH);
  const publication = await readJson(PUBLICATION_PATH);
  const integrity = verifyIntegrity(
    master,
    publication,
    parseResult.records,
    parseResult.sourceRecordCount
  );
  console.log(integrity.passed ? "Catalogue integrity checks passed." : integrity.errors.join("\n"));
  if (!integrity.passed) process.exitCode = 1;
  return integrity;
}

async function report() {
  const { parseResult, validation } = await sourceAnalysis();
  const master = await readJson(MASTER_PATH);
  const publication = await readJson(PUBLICATION_PATH);
  const integrity = verifyIntegrity(
    master,
    publication,
    parseResult.records,
    parseResult.sourceRecordCount
  );
  await writeReport(createReport({ parseResult, validation, integrity }));
  console.log(`Wrote ${REPORT_PATH}.`);
  const blocking =
    parseResult.errors.length +
    validation.issues.filter(({ level }) => level === "blocking").length;
  if (blocking > 0 || !integrity.passed) process.exitCode = 1;
}

async function build() {
  const { parseResult, validation } = await sourceAnalysis();
  await writeJson(MASTER_PATH, parseResult.records);
  const publication = shuffleRecords(parseResult.records);
  await writeJson(PUBLICATION_PATH, publication);
  const integrity = verifyIntegrity(
    parseResult.records,
    publication,
    parseResult.records,
    parseResult.sourceRecordCount
  );
  await writeReport(createReport({ parseResult, validation, integrity }));
  const blocking =
    parseResult.errors.length +
    validation.issues.filter(({ level }) => level === "blocking").length;
  const editorial = new Set(
    validation.issues
      .filter(({ level }) => level === "editorial")
      .map(({ recordIndex }) => recordIndex)
  ).size;
  console.log(
    `Built ${parseResult.records.length} records: ${blocking} blocking errors, ${editorial} records requiring editorial review; integrity ${integrity.passed ? "passed" : "failed"}.`
  );
  if (blocking > 0 || !integrity.passed) process.exitCode = 1;
}

const commands = { build, parse, report, shuffle, validate, verify };
if (!commands[command]) {
  throw new Error(`Unknown catalogue command: ${command}`);
}
await commands[command]();

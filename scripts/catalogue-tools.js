import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const RAW_PATH = "raw_dictionary.txt";
export const MASTER_PATH = "data/words_master.json";
export const PUBLICATION_PATH = "data/words_publication.json";
export const REPORT_PATH = "data/catalogue_validation_report.md";
export const SHUFFLE_SEED = "diurnus-publication-v1-2026-10-08";
export const FIELDS = [
  "word",
  "type",
  "phonetic",
  "definition",
  "usage",
  "synonyms"
];

const TEXT_FIELDS = ["word", "type", "phonetic", "definition", "usage"];
const KNOWN_TYPES = new Set([
  "adjective",
  "adverb",
  "conjunction",
  "idiom",
  "interjection",
  "noun",
  "noun phrase",
  "phrase",
  "preposition",
  "verb"
]);
const HTML_ENTITY_PATTERN = /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/giu;

function lineAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function locationLabel(location) {
  return `array ${location.array}, record ${location.record}, line ${location.line}`;
}

class CatalogueParser {
  constructor(source) {
    this.source = source;
    this.index = 0;
    this.line = 1;
    this.repairs = [];
  }

  peek(offset = 0) {
    return this.source[this.index + offset];
  }

  take() {
    const character = this.source[this.index++];
    if (character === "\n") this.line += 1;
    return character;
  }

  skipSpace() {
    while (this.index < this.source.length) {
      if (/\s/u.test(this.peek())) {
        this.take();
      } else if (this.peek() === "/" && this.peek(1) === "/") {
        while (this.index < this.source.length && this.take() !== "\n") {}
      } else if (this.peek() === "/" && this.peek(1) === "*") {
        this.take();
        this.take();
        while (
          this.index < this.source.length &&
          !(this.peek() === "*" && this.peek(1) === "/")
        ) {
          this.take();
        }
        if (this.index < this.source.length) {
          this.take();
          this.take();
        }
      } else {
        break;
      }
    }
  }

  error(message) {
    throw new Error(`${message} at line ${this.line}`);
  }

  expect(character) {
    this.skipSpace();
    if (this.peek() !== character) {
      this.error(`Expected ${JSON.stringify(character)}`);
    }
    this.take();
  }

  readString(propertyValue = false) {
    const quote = this.take();
    const startLine = this.line;
    let closingIndex;
    if (propertyValue) {
      const lineEnd = this.source.indexOf("\n", this.index);
      const end = lineEnd < 0 ? this.source.length : lineEnd;
      let escaped = false;
      for (let index = this.index; index < end; index += 1) {
        const character = this.source[index];
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === quote) {
          closingIndex = index;
        }
      }
    }
    let result = "";

    if (quote === "'") {
      this.repairs.push({
        kind: "single-quoted string",
        line: startLine,
        detail: "Converted a single-quoted JavaScript string to JSON."
      });
    }

    while (this.index < this.source.length) {
      const character = this.take();
      if (character === quote) {
        if (propertyValue && this.index - 1 === closingIndex) return result;
        const remainder = this.source.slice(this.index);
        const next = /\S/u.exec(remainder)?.[0];
        if (
          !propertyValue &&
          (!next || [",", ":", "}", "]"].includes(next))
        ) {
          return result;
        }
        this.repairs.push({
          kind: "unescaped internal quotation mark",
          line: this.line,
          detail: "Preserved an unescaped quotation mark inside a string."
        });
        result += character;
        continue;
      }
      if (character === "\n" || character === "\r") {
        this.error("Unterminated string");
      }
      if (character !== "\\") {
        result += character;
        continue;
      }

      if (this.index >= this.source.length) this.error("Unterminated escape");
      const escaped = this.take();
      const escapes = {
        b: "\b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "\t",
        v: "\v",
        "0": "\0"
      };
      if (escaped === "u") {
        const hex = this.source.slice(this.index, this.index + 4);
        if (!/^[0-9a-f]{4}$/iu.test(hex)) this.error("Invalid Unicode escape");
        result += String.fromCharCode(Number.parseInt(hex, 16));
        this.index += 4;
      } else if (escaped === "x") {
        const hex = this.source.slice(this.index, this.index + 2);
        if (!/^[0-9a-f]{2}$/iu.test(hex)) this.error("Invalid hexadecimal escape");
        result += String.fromCharCode(Number.parseInt(hex, 16));
        this.index += 2;
      } else if (escaped === "\n") {
        // JavaScript line continuation: mechanically join the source lines.
      } else {
        result += escapes[escaped] ?? escaped;
      }
    }

    this.error("Unterminated string");
  }

  readIdentifier() {
    let value = "";
    while (/[$\p{L}\p{N}_-]/u.test(this.peek() ?? "")) value += this.take();
    if (!value) this.error("Expected identifier");
    return value;
  }

  parseValue(context = "array") {
    this.skipSpace();
    const character = this.peek();
    if (character === '"' || character === "'") {
      return this.readString(context === "property");
    }
    if (character === "{") return this.parseObject();
    if (character === "[") return this.parseArray();

    const line = this.line;
    const identifier = this.readIdentifier();
    this.repairs.push({
      kind: "unquoted scalar",
      line,
      detail: `Treated unquoted scalar ${JSON.stringify(identifier)} as text.`
    });
    return identifier;
  }

  parseArray() {
    this.expect("[");
    const values = [];
    this.skipSpace();
    while (this.peek() !== "]") {
      if (this.index >= this.source.length) this.error("Unterminated array");
      values.push(this.parseValue());
      this.skipSpace();
      if (this.peek() === ",") {
        this.take();
        this.skipSpace();
      } else if (this.peek() !== "]") {
        this.error("Expected comma or closing bracket");
      }
    }
    this.take();
    return values;
  }

  parseTopLevelArray() {
    this.expect("[");
    const values = [];
    const lines = [];
    const recordNumbers = [];
    const errors = [];
    let sourceRecord = 0;
    this.skipSpace();
    while (this.peek() !== "]") {
      if (this.index >= this.source.length) this.error("Unterminated array");
      sourceRecord += 1;
      const recordLine = this.line;
      const recordStart = this.index;
      try {
        const value = this.parseValue();
        values.push(value);
        lines.push(recordLine);
        recordNumbers.push(sourceRecord);
      } catch (error) {
        const remainder = this.source.slice(this.index);
        const match = /(?:^|\n)\s*\},?\s*\n\s*\{/u.exec(remainder);
        if (!match) throw error;
        const failedSource = this.source.slice(
          recordStart,
          this.index + match.index
        );
        const word = /\bword\s*:\s*["']([^"']+)["']/u.exec(failedSource)?.[1];
        errors.push({
          record: sourceRecord,
          line: recordLine,
          message: error.message,
          word
        });
        const nextObject = match.index + match[0].lastIndexOf("{");
        const target = this.index + nextObject;
        while (this.index < target) this.take();
        this.skipSpace();
        continue;
      }
      this.skipSpace();
      if (this.peek() === ",") {
        this.take();
        this.skipSpace();
      } else if (this.peek() !== "]") {
        this.error("Expected comma or closing bracket");
      }
    }
    this.take();
    return { values, lines, recordNumbers, errors, sourceRecords: sourceRecord };
  }

  parseObject() {
    this.expect("{");
    const value = {};
    this.skipSpace();
    while (this.peek() !== "}") {
      if (this.index >= this.source.length) this.error("Unterminated object");
      const line = this.line;
      const key =
        this.peek() === '"' || this.peek() === "'"
          ? this.readString()
          : this.readIdentifier();
      if (!(this.peek(-1) === '"' || this.peek(-1) === "'")) {
        this.repairs.push({
          kind: "unquoted property name",
          line,
          detail: `Quoted property name ${JSON.stringify(key)} for JSON output.`
        });
      }
      this.expect(":");
      if (Object.hasOwn(value, key)) {
        this.error(`Duplicate property ${JSON.stringify(key)}`);
      }
      value[key] = this.parseValue("property");
      this.skipSpace();
      if (this.peek() === ",") {
        this.take();
        this.skipSpace();
      } else if (this.peek() === "]") {
        this.repairs.push({
          kind: "missing closing object brace",
          line: this.line,
          detail: "Inserted an unambiguous missing closing brace before an array ended."
        });
        return value;
      } else if (this.peek() !== "}") {
        this.error("Expected comma or closing brace");
      }
    }
    this.take();
    return value;
  }
}

function countSourceRecords(source) {
  return source.match(/^\s*\{\s*$/gmu)?.length ?? 0;
}

function replaceWhitespaceEntities(source) {
  const repairs = [];
  const patterns = [/&#x20;/giu, /&#32;/gu, /&nbsp;/giu];
  let output = source;
  for (const pattern of patterns) {
    output = output.replace(pattern, (entity, offset) => {
      repairs.push({
        kind: "HTML whitespace entity",
        line: lineAt(output, offset),
        detail: `Decoded ${entity} as a space.`
      });
      return " ".repeat(entity.length);
    });
  }
  return { source: output, repairs };
}

export function parseRawCatalogue(rawSource) {
  const normalisedNewlines = rawSource.replace(/\r\n?/gu, "\n");
  const entityResult = replaceWhitespaceEntities(normalisedNewlines);
  const parser = new CatalogueParser(entityResult.source);
  const records = [];
  const locations = [];
  const arrays = [];
  const errors = [];
  let arrayNumber = 0;
  const sourceRecordCount = countSourceRecords(entityResult.source);

  while (parser.index < parser.source.length) {
    parser.skipSpace();
    while (parser.index < parser.source.length && parser.peek() !== "[") {
      parser.take();
      parser.skipSpace();
    }
    if (parser.index >= parser.source.length) break;

    arrayNumber += 1;
    const startLine = parser.line;
    try {
      const array = parser.parseTopLevelArray();
      arrays.push({
        number: arrayNumber,
        line: startLine,
        records: array.values.length,
        sourceRecords: array.sourceRecords
      });
      errors.push(
        ...array.errors.map((error) => ({ array: arrayNumber, ...error }))
      );
      array.values.forEach((record, index) => {
        records.push(record);
        locations.push({
          array: arrayNumber,
          record: array.recordNumbers[index],
          line: array.lines[index]
        });
      });
    } catch (error) {
      errors.push({ array: arrayNumber, line: startLine, message: error.message });
      // Recover at the next line that begins a new top-level array.
      const remainder = parser.source.slice(parser.index);
      const match = /\n\s*\[/u.exec(remainder);
      if (!match) break;
      const advance = match.index + match[0].lastIndexOf("[");
      const target = parser.index + advance;
      while (parser.index < target) parser.take();
    }
  }

  return {
    records,
    locations,
    arrays,
    sourceRecordCount,
    errors,
    repairs: [...entityResult.repairs, ...parser.repairs]
  };
}

function issue(level, code, message, recordIndex, locations, word) {
  return {
    level,
    code,
    message,
    recordIndex,
    word: word || `(record ${recordIndex + 1})`,
    location: locations[recordIndex]
  };
}

export function validateRecords(records, locations) {
  const issues = [];
  const words = new Map();
  const typeCounts = new Map();

  records.forEach((record, recordIndex) => {
    const word = typeof record?.word === "string" ? record.word : undefined;
    const keys = record && typeof record === "object" ? Object.keys(record) : [];
    const missing = FIELDS.filter((field) => !keys.includes(field));
    const additional = keys.filter((field) => !FIELDS.includes(field));
    if (missing.length || additional.length) {
      issues.push(
        issue(
          "blocking",
          "schema",
          `Missing fields: ${missing.join(", ") || "none"}; additional fields: ${additional.join(", ") || "none"}.`,
          recordIndex,
          locations,
          word
        )
      );
    }

    for (const field of TEXT_FIELDS) {
      if (typeof record?.[field] !== "string" || record[field].length === 0) {
        issues.push(
          issue(
            "blocking",
            "invalid-text-field",
            `${field} must be a non-empty string.`,
            recordIndex,
            locations,
            word
          )
        );
      } else {
        if (record[field] !== record[field].trim()) {
          issues.push(
            issue(
              "editorial",
              "whitespace",
              `${field} has leading or trailing whitespace.`,
              recordIndex,
              locations,
              word
            )
          );
        }
        const entities = record[field].match(HTML_ENTITY_PATTERN);
        if (entities) {
          issues.push(
            issue(
              "editorial",
              "html-entity",
              `${field} contains HTML entity/entities: ${entities.join(", ")}.`,
              recordIndex,
              locations,
              word
            )
          );
        }
      }
    }

    if (!Array.isArray(record?.synonyms)) {
      issues.push(
        issue(
          "blocking",
          "invalid-synonyms",
          "synonyms must be an array of strings.",
          recordIndex,
          locations,
          word
        )
      );
    } else {
      if (record.synonyms.some((synonym) => typeof synonym !== "string")) {
        issues.push(
          issue(
            "blocking",
            "invalid-synonyms",
            "synonyms contains a non-string value.",
            recordIndex,
            locations,
            word
          )
        );
      }
      if (record.synonyms.length > 3) {
        issues.push(
          issue(
            "editorial",
            "synonym-limit",
            `Contains ${record.synonyms.length} synonyms; maximum is three.`,
            recordIndex,
            locations,
            word
          )
        );
      }

      const synonymKeys = new Set();
      for (const synonym of record.synonyms.filter(
        (value) => typeof value === "string"
      )) {
        if (synonym !== synonym.trim()) {
          issues.push(
            issue(
              "editorial",
              "whitespace",
              `Synonym ${JSON.stringify(synonym)} has leading or trailing whitespace.`,
              recordIndex,
              locations,
              word
            )
          );
        }
        const key = synonym.normalize("NFKC").trim().toLocaleLowerCase("en");
        if (synonymKeys.has(key)) {
          issues.push(
            issue(
              "editorial",
              "duplicate-synonym",
              `Duplicate synonym: ${JSON.stringify(synonym)}.`,
              recordIndex,
              locations,
              word
            )
          );
        }
        synonymKeys.add(key);
        if (
          typeof word === "string" &&
          key === word.normalize("NFKC").trim().toLocaleLowerCase("en")
        ) {
          issues.push(
            issue(
              "editorial",
              "headword-synonym",
              `Synonym matches the headword: ${JSON.stringify(synonym)}.`,
              recordIndex,
              locations,
              word
            )
          );
        }
        const entities = synonym.match(HTML_ENTITY_PATTERN);
        if (entities) {
          issues.push(
            issue(
              "editorial",
              "html-entity",
              `Synonym contains HTML entity/entities: ${entities.join(", ")}.`,
              recordIndex,
              locations,
              word
            )
          );
        }
      }
    }

    if (typeof word === "string") {
      const key = word.normalize("NFKC").trim().toLocaleLowerCase("en");
      if (words.has(key)) {
        const firstIndex = words.get(key);
        issues.push(
          issue(
            "editorial",
            "duplicate-word",
            `Duplicates record ${firstIndex + 1} (${locationLabel(locations[firstIndex])}).`,
            recordIndex,
            locations,
            word
          )
        );
      } else {
        words.set(key, recordIndex);
      }
    }

    if (typeof record?.type === "string") {
      const type = record.type.normalize("NFKC").trim().toLocaleLowerCase("en");
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      if (!KNOWN_TYPES.has(type)) {
        issues.push(
          issue(
            "editorial",
            "unexpected-type",
            `Unexpected grammatical type: ${JSON.stringify(record.type)}.`,
            recordIndex,
            locations,
            word
          )
        );
      }
    }
  });

  return { issues, uniqueWords: words.size, typeCounts };
}

function seedToUint32(seed) {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleRecords(records, seed = SHUFFLE_SEED) {
  const diurnalIndex = records.findIndex(
    ({ word }) =>
      typeof word === "string" &&
      word.normalize("NFKC").trim().toLocaleLowerCase("en") === "diurnal"
  );
  if (diurnalIndex < 0) throw new Error("Diurnal was not found in the catalogue.");

  const first = records[diurnalIndex];
  const remaining = records.filter((_, index) => index !== diurnalIndex);
  const random = mulberry32(seedToUint32(seed));
  for (let index = remaining.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [remaining[index], remaining[swapIndex]] = [
      remaining[swapIndex],
      remaining[index]
    ];
  }
  return [first, ...remaining];
}

function stableRecord(record) {
  return JSON.stringify(FIELDS.map((field) => record[field]));
}

export function verifyIntegrity(
  master,
  publication,
  parsedSource,
  sourceCount = parsedSource.length
) {
  const errors = [];
  const checks = {
    equalRecordCounts: master.length === publication.length,
    sourceReconciled: master.length === sourceCount,
    masterMatchesParsedSource:
      JSON.stringify(master) === JSON.stringify(parsedSource),
    identicalMetadata: true,
    diurnalFirst:
      publication[0]?.word
        ?.normalize("NFKC")
        .trim()
        .toLocaleLowerCase("en") === "diurnal",
    reproducibleShuffle: false
  };
  if (!checks.equalRecordCounts) {
    errors.push(
      `Master has ${master.length} records but publication has ${publication.length}.`
    );
  }
  if (!checks.sourceReconciled) {
    errors.push(
      `Source has ${sourceCount} detected records but master has ${master.length} safely parsed records.`
    );
  }
  if (!checks.masterMatchesParsedSource) {
    errors.push("Master catalogue differs from the safely parsed source records.");
  }

  const counts = (records) => {
    const map = new Map();
    for (const record of records) {
      const key = stableRecord(record);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  };
  const masterCounts = counts(master);
  const publicationCounts = counts(publication);
  const keys = new Set([...masterCounts.keys(), ...publicationCounts.keys()]);
  for (const key of keys) {
    if ((masterCounts.get(key) ?? 0) !== (publicationCounts.get(key) ?? 0)) {
      checks.identicalMetadata = false;
      errors.push("Master/publication record metadata differs or is missing.");
      break;
    }
  }

  if (!checks.diurnalFirst) {
    errors.push("Diurnal is not first in the publication catalogue.");
  }
  checks.reproducibleShuffle =
    JSON.stringify(shuffleRecords(master, SHUFFLE_SEED)) ===
    JSON.stringify(publication);
  if (!checks.reproducibleShuffle) {
    errors.push("Publication order is not reproducible from the recorded seed.");
  }

  return { passed: errors.length === 0, errors, checks };
}

function issueSection(title, issues) {
  const lines = [`### ${title}`, ""];
  if (issues.length === 0) return [...lines, "None.", ""].join("\n");
  for (const item of issues) {
    const location = item.location ? locationLabel(item.location) : "source location unavailable";
    lines.push(`- **${item.word}** — ${item.message} (${location}; \`${item.code}\`)`);
  }
  lines.push("");
  return lines.join("\n");
}

export function createReport({ parseResult, validation, integrity }) {
  const blocking = validation.issues.filter(({ level }) => level === "blocking");
  const editorial = validation.issues.filter(({ level }) => level === "editorial");
  const parseErrors = parseResult.errors.map((error) => ({
    level: "blocking",
    code: "parse-error",
    word: error.word ?? `(array ${error.array})`,
    message: error.message,
    location: { array: error.array, record: error.record ?? 0, line: error.line }
  }));
  const allBlocking = [...parseErrors, ...blocking];
  const schemaIssues = blocking.filter(({ code }) => code === "schema");
  const invalidFields = blocking.filter(({ code }) => code !== "schema");
  const duplicateWords = editorial.filter(({ code }) => code === "duplicate-word");
  const synonymLimits = editorial.filter(({ code }) => code === "synonym-limit");
  const duplicateSynonyms = editorial.filter(
    ({ code }) => code === "duplicate-synonym"
  );
  const whitespace = editorial.filter(({ code }) => code === "whitespace");
  const unexpectedTypes = editorial.filter(
    ({ code }) => code === "unexpected-type"
  );
  const htmlEntities = editorial.filter(({ code }) => code === "html-entity");
  const headwordSynonyms = editorial.filter(
    ({ code }) => code === "headword-synonym"
  );
  const otherEditorial = editorial.filter(
    ({ code }) =>
      ![
        "duplicate-word",
        "synonym-limit",
        "duplicate-synonym",
        "whitespace",
        "unexpected-type",
        "html-entity",
        "headword-synonym"
      ].includes(code)
  );
  const repairedKinds = new Map();
  for (const repair of parseResult.repairs) {
    repairedKinds.set(repair.kind, (repairedKinds.get(repair.kind) ?? 0) + 1);
  }
  const uniqueEditorialRecords = new Set(
    editorial.map(({ recordIndex }) => recordIndex)
  ).size;

  return `# Diurnus Catalogue Validation Report

Generated by \`npm run catalogue:build\`.

## Summary

- Source arrays detected: ${parseResult.arrays.length}
- Source records detected: ${parseResult.sourceRecordCount}
- Successfully parsed records: ${parseResult.records.length}
- Unique words (Unicode NFKC, case-insensitive): ${validation.uniqueWords}
- Blocking errors: ${allBlocking.length}
- Records requiring editorial review: ${uniqueEditorialRecords}
- Master/publication integrity: ${integrity.passed ? "PASSED" : "FAILED"}
- Shuffle seed: \`${SHUFFLE_SEED}\`

## Blocking errors

${issueSection("Unresolved parsing errors", parseErrors)}
${issueSection("Missing or additional properties", schemaIssues)}
${issueSection("Missing or invalid fields", invalidFields)}
## Editorial review required

${issueSection("Duplicate words", duplicateWords)}
${issueSection("Records with more than three synonyms", synonymLimits)}
${issueSection("Duplicate synonyms", duplicateSynonyms)}
${issueSection("Whitespace and formatting issues", whitespace)}
${issueSection("Unexpected HTML entities", htmlEntities)}
${issueSection("Synonyms matching the headword", headwordSynonyms)}
${issueSection("Unexpected grammatical types", unexpectedTypes)}
${issueSection("Other editorial issues", otherEditorial)}
## Informational observations

### Parsing repairs performed

${repairedKinds.size ? [...repairedKinds].map(([kind, count]) => `- ${kind}: ${count}`).join("\n") : "None."}

${parseResult.repairs.filter(({ kind }) => kind !== "unquoted property name").map((repair) => `- Line ${repair.line}: ${repair.detail}`).join("\n") || "No non-routine repairs."}

Unquoted JavaScript property names are treated as a mechanical syntax conversion only; string content is not editorially rewritten.

### Grammatical types observed

${[...validation.typeCounts].sort(([a], [b]) => a.localeCompare(b)).map(([type, count]) => `- ${type}: ${count}`).join("\n")}

### Master/publication integrity

- Master and publication counts equal: ${integrity.checks.equalRecordCounts ? "PASSED" : "FAILED"}
- Metadata multiset identical: ${integrity.checks.identicalMetadata ? "PASSED" : "FAILED"}
- Master matches safely parsed source: ${integrity.checks.masterMatchesParsedSource ? "PASSED" : "FAILED"}
- Diurnal first: ${integrity.checks.diurnalFirst ? "PASSED" : "FAILED"}
- Seeded shuffle reproducible: ${integrity.checks.reproducibleShuffle ? "PASSED" : "FAILED"}
- Source count fully reconciled: ${integrity.checks.sourceReconciled ? "PASSED" : "FAILED"}

${integrity.errors.length ? integrity.errors.map((error) => `- ${error}`).join("\n") : "All integrity checks passed."}

### Source reconciliation

${parseResult.sourceRecordCount === parseResult.records.length && parseResult.records.length === parseResult.arrays.reduce((sum, array) => sum + array.records, 0) ? "Detected source records and array totals reconcile with parsed output." : `FAILED: detected ${parseResult.sourceRecordCount} source records but safely parsed ${parseResult.records.length}. No unresolved record was included or silently omitted.`}

## Readiness

- Successfully converted records: ${parseResult.records.length} of ${parseResult.sourceRecordCount}
- Catalogue conversion complete: ${allBlocking.length === 0 ? "Yes" : "No — blocking errors remain"}
- Structurally valid JSON outputs: Yes
- Editorially approved: ${editorial.length === 0 ? "No issues detected" : "No — review the editorial findings above"}
- Ready for production integration: No. This task creates preparation artefacts only; integration requires a separate reviewed change.
`;
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function loadSource() {
  return readFile(RAW_PATH, "utf8");
}

export async function writeReport(report) {
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, report, "utf8");
}

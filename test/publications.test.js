import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createApp } from "../app.js";
import { createPublicationDateResolver } from "../publication-date.js";
import {
  CATALOGUE_GENERATION,
  publications,
  validatePublications
} from "../publications.js";

let server;
let baseUrl;
let effectiveDate = "2026-10-19";

before(async () => {
  const app = createApp({
    publications,
    resolvePublicationDate: () => effectiveDate,
    catalogueGeneration: CATALOGUE_GENERATION
  });

  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return { response, body: await response.json() };
}

function publicationOn(publicationDate) {
  return publications.find(
    (publication) => publication.publicationDate === publicationDate
  );
}

test("publication ledger is valid, unique, and chronologically consecutive", () => {
  assert.doesNotThrow(() => validatePublications(publications));
  assert.equal(publications.length, 787);
  assert.deepEqual(
    publications[0],
    publicationOn("2026-10-16")
  );
  assert.equal(publications[0].sequence, 1);
  assert.equal(publications[0].word, "Diurnal");
  assert.equal(publications.at(-1).sequence, 787);
  assert.equal(publications.at(-1).publicationDate, "2028-12-10");
  assert.equal(new Set(publications.map(({ id }) => id)).size, publications.length);
  assert.equal(
    new Set(publications.map(({ publicationDate }) => publicationDate)).size,
    publications.length
  );
  assert.deepEqual(
    publications.map(({ sequence }) => sequence),
    Array.from({ length: publications.length }, (_, index) => index + 1)
  );
  assert.equal(
    new Set(publications.map(({ word }) => word.trim().toLocaleLowerCase("en")))
      .size,
    publications.length
  );
  assert.deepEqual(
    publications.map(({ publicationDate }) => publicationDate),
    publications
      .map(({ publicationDate }) => publicationDate)
      .toSorted((a, b) => a.localeCompare(b))
  );
  publications.slice(1).forEach((publication, index) => {
    const previous = publications[index];
    assert.equal(
      Date.parse(`${publication.publicationDate}T00:00:00Z`) -
        Date.parse(`${previous.publicationDate}T00:00:00Z`),
      24 * 60 * 60 * 1000
    );
  });
});

test("startup validation rejects malformed immutable ledger fields", () => {
  const invalidId = structuredClone(publications);
  invalidId[0].id = "not-a-uuid";
  assert.throws(() => validatePublications(invalidId), /valid UUID/);

  const outOfOrder = structuredClone(publications);
  outOfOrder[1].sequence = 999;
  assert.throws(() => validatePublications(outOfOrder), /ordered consecutively/);

  const dateGap = structuredClone(publications);
  dateGap[1].publicationDate = "2030-01-01";
  assert.throws(() => validatePublications(dateGap), /exactly one calendar day/);

  const duplicateWord = structuredClone(publications);
  duplicateWord[1].word = publications[0].word.toUpperCase();
  assert.throws(() => validatePublications(duplicateWord), /word spelling/);
});

test("valid empty synonym arrays are supported without changing editorial content", () => {
  assert.deepEqual(
    publications.find(({ word }) => word === "Zeugma").synonyms,
    []
  );
  assert.deepEqual(
    publications.find(({ word }) => word === "Solipsism").synonyms,
    []
  );
  assert.doesNotThrow(() => validatePublications(publications));
});

test("GET /publications returns published entries only, newest first", async () => {
  effectiveDate = "2026-10-19";
  const { response, body } = await get("/publications");

  assert.equal(response.status, 200);
  assert.deepEqual(
    body.map(({ sequence }) => sequence),
    [4, 3, 2, 1]
  );
  assert.ok(body.every(({ publicationDate }) => publicationDate <= effectiveDate));
});

test("GET /publications excludes future scheduled publications", async () => {
  effectiveDate = "2026-10-17";
  const { body } = await get("/publications");

  assert.deepEqual(
    body.map(({ sequence }) => sequence),
    [2, 1]
  );
});

test("DIURNUS_DATE_OVERRIDE controls archive visibility", async () => {
  const resolvePublicationDate = createPublicationDateResolver({
    dateOverride: "2026-10-18"
  });
  const app = createApp({
    publications,
    resolvePublicationDate,
    catalogueGeneration: CATALOGUE_GENERATION
  });
  const testServer = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });

  try {
    const { port } = testServer.address();
    const response = await fetch(`http://127.0.0.1:${port}/publications`);
    const body = await response.json();
    assert.deepEqual(
      body.map(({ sequence }) => sequence),
      [3, 2, 1]
    );
  } finally {
    await new Promise((resolve) => testServer.close(resolve));
  }
});

test("GET /publications returns 200 [] before publication history begins", async () => {
  effectiveDate = "2026-10-15";
  const { response, body } = await get("/publications");

  assert.equal(response.status, 200);
  assert.deepEqual(body, []);
});

test("GET /publications/:id returns a published publication", async () => {
  effectiveDate = "2026-10-18";
  const expected = publicationOn("2026-10-17");
  const { response, body } = await get(`/publications/${expected.id}`);

  assert.equal(response.status, 200);
  assert.deepEqual(body, expected);
});

test("GET /publications/:id returns a safe 404 for an unknown ID", async () => {
  effectiveDate = "2026-10-18";
  const { response, body } = await get("/publications/unknown-id");

  assert.equal(response.status, 404);
  assert.deepEqual(body, {
    error: "Publication not found.",
    code: "PUBLICATION_NOT_FOUND"
  });
});

test("GET /publications/:id returns the same safe 404 for a future ID", async () => {
  effectiveDate = "2026-10-18";
  const future = publicationOn("2026-10-19");
  const { response, body } = await get(`/publications/${future.id}`);

  assert.equal(response.status, 404);
  assert.deepEqual(body, {
    error: "Publication not found.",
    code: "PUBLICATION_NOT_FOUND"
  });
});

test("GET /word retains its exact-date success and missing-date contracts", async () => {
  effectiveDate = "2026-10-17";
  const success = await get("/word");
  assert.equal(success.response.status, 200);
  assert.deepEqual(success.body, publicationOn("2026-10-17"));
  assert.equal(
    success.response.headers.get("x-diurnus-catalogue-generation"),
    CATALOGUE_GENERATION
  );
  assert.equal("wordId" in success.body, false);

  effectiveDate = "2028-12-11";
  const missing = await get("/word");
  assert.equal(missing.response.status, 404);
  assert.deepEqual(missing.body, {
    error: "No publication scheduled for this date.",
    code: "PUBLICATION_NOT_FOUND",
    publicationDate: "2028-12-11"
  });
});

test("catalogue boundary dates do not wrap or fall back", async () => {
  effectiveDate = "2026-10-15";
  const before = await get("/word");
  assert.equal(before.response.status, 404);
  assert.equal(before.body.publicationDate, "2026-10-15");

  effectiveDate = "2026-10-16";
  const first = await get("/word");
  assert.equal(first.response.status, 200);
  assert.equal(first.body.sequence, 1);
  assert.equal(first.body.word, "Diurnal");

  effectiveDate = "2028-12-10";
  const final = await get("/word");
  assert.equal(final.response.status, 200);
  assert.equal(final.body.sequence, 787);
  assert.equal(final.body.word, "Trompe-l'œil");

  effectiveDate = "2028-12-11";
  const after = await get("/word");
  assert.equal(after.response.status, 404);
  assert.equal(after.body.publicationDate, "2028-12-11");

  const archive = await get("/publications");
  assert.equal(archive.response.status, 200);
  assert.equal(archive.body.length, 787);
  assert.equal(archive.body[0].sequence, 787);
  assert.equal(archive.body.at(-1).sequence, 1);
});

test("health reports the active catalogue without changing publication contracts", async () => {
  const { response, body } = await get("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    status: "ok",
    catalogueGeneration: CATALOGUE_GENERATION,
    publicationCount: 787,
    publicationTimezone: "Europe/London"
  });
});

test("unknown routes and unexpected failures return structured JSON errors", async () => {
  const unknown = await get("/does-not-exist");
  assert.equal(unknown.response.status, 404);
  assert.deepEqual(unknown.body, {
    error: "Not Found",
    code: "NOT_FOUND"
  });

  const failingApp = createApp({
    publications,
    resolvePublicationDate: () => {
      throw new Error("test failure");
    },
    catalogueGeneration: CATALOGUE_GENERATION
  });
  const failingServer = await new Promise((resolve) => {
    const listening = failingApp.listen(0, "127.0.0.1", () => resolve(listening));
  });

  try {
    const { port } = failingServer.address();
    const response = await fetch(`http://127.0.0.1:${port}/word`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: "Internal Server Error",
      code: "INTERNAL_SERVER_ERROR"
    });
  } finally {
    await new Promise((resolve) => failingServer.close(resolve));
  }
});

test("Europe/London calendar boundaries account for daylight saving time", () => {
  const beforeSummerMidnight = createPublicationDateResolver({
    now: () => new Date("2026-06-30T22:59:59Z")
  });
  const afterSummerMidnight = createPublicationDateResolver({
    now: () => new Date("2026-06-30T23:00:00Z")
  });
  const beforeWinterMidnight = createPublicationDateResolver({
    now: () => new Date("2026-11-30T23:59:59Z")
  });
  const afterWinterMidnight = createPublicationDateResolver({
    now: () => new Date("2026-12-01T00:00:00Z")
  });

  assert.equal(beforeSummerMidnight(), "2026-06-30");
  assert.equal(afterSummerMidnight(), "2026-07-01");
  assert.equal(beforeWinterMidnight(), "2026-11-30");
  assert.equal(afterWinterMidnight(), "2026-12-01");
});

test("DIURNUS_DATE_OVERRIDE is rejected in production", () => {
  assert.throws(
    () =>
      createPublicationDateResolver({
        dateOverride: "2026-09-28",
        nodeEnv: "production"
      }),
    /must not be configured/
  );
});

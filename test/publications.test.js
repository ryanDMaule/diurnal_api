import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createApp } from "../app.js";
import { createPublicationDateResolver } from "../publication-date.js";
import { publications } from "../publications.js";

let server;
let baseUrl;
let effectiveDate = "2026-09-04";

before(async () => {
  const app = createApp({
    publications,
    resolvePublicationDate: () => effectiveDate
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

test("development fixtures have unique IDs, dates, and chronological sequences", () => {
  assert.equal(new Set(publications.map(({ id }) => id)).size, publications.length);
  assert.equal(
    new Set(publications.map(({ publicationDate }) => publicationDate)).size,
    publications.length
  );
  assert.deepEqual(
    publications.map(({ sequence }) => sequence),
    Array.from({ length: publications.length }, (_, index) => index + 1)
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

test("GET /publications returns published entries only, newest first", async () => {
  effectiveDate = "2026-09-04";
  const { response, body } = await get("/publications");

  assert.equal(response.status, 200);
  assert.deepEqual(
    body.map(({ sequence }) => sequence),
    Array.from({ length: 31 }, (_, index) => 31 - index)
  );
  assert.ok(body.every(({ publicationDate }) => publicationDate <= effectiveDate));
});

test("GET /publications excludes future scheduled publications", async () => {
  effectiveDate = "2026-09-02";
  const { body } = await get("/publications");

  assert.deepEqual(
    body.map(({ sequence }) => sequence),
    Array.from({ length: 29 }, (_, index) => 29 - index)
  );
});

test("DIURNUS_DATE_OVERRIDE controls archive visibility", async () => {
  const resolvePublicationDate = createPublicationDateResolver({
    dateOverride: "2026-09-03"
  });
  const app = createApp({ publications, resolvePublicationDate });
  const testServer = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });

  try {
    const { port } = testServer.address();
    const response = await fetch(`http://127.0.0.1:${port}/publications`);
    const body = await response.json();
    assert.deepEqual(
      body.map(({ sequence }) => sequence),
      Array.from({ length: 30 }, (_, index) => 30 - index)
    );
  } finally {
    await new Promise((resolve) => testServer.close(resolve));
  }
});

test("GET /publications returns 200 [] before publication history begins", async () => {
  effectiveDate = "2026-08-04";
  const { response, body } = await get("/publications");

  assert.equal(response.status, 200);
  assert.deepEqual(body, []);
});

test("GET /publications/:id returns a published publication", async () => {
  effectiveDate = "2026-09-03";
  const expected = publicationOn("2026-09-02");
  const { response, body } = await get(`/publications/${expected.id}`);

  assert.equal(response.status, 200);
  assert.deepEqual(body, expected);
});

test("GET /publications/:id returns a safe 404 for an unknown ID", async () => {
  effectiveDate = "2026-09-03";
  const { response, body } = await get("/publications/unknown-id");

  assert.equal(response.status, 404);
  assert.deepEqual(body, {
    error: "Publication not found.",
    code: "PUBLICATION_NOT_FOUND"
  });
});

test("GET /publications/:id returns the same safe 404 for a future ID", async () => {
  effectiveDate = "2026-09-03";
  const future = publicationOn("2026-09-04");
  const { response, body } = await get(`/publications/${future.id}`);

  assert.equal(response.status, 404);
  assert.deepEqual(body, {
    error: "Publication not found.",
    code: "PUBLICATION_NOT_FOUND"
  });
});

test("GET /word retains its exact-date success and missing-date contracts", async () => {
  effectiveDate = "2026-09-02";
  const success = await get("/word");
  assert.equal(success.response.status, 200);
  assert.deepEqual(success.body, publicationOn("2026-09-02"));

  effectiveDate = "2026-09-08";
  const missing = await get("/word");
  assert.equal(missing.response.status, 404);
  assert.deepEqual(missing.body, {
    error: "No publication scheduled for this date.",
    code: "PUBLICATION_NOT_FOUND",
    publicationDate: "2026-09-08"
  });
});

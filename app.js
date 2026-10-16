import express from "express";
import cors from "cors";

const CATALOGUE_GENERATION_HEADER = "X-Diurnus-Catalogue-Generation";

export function createApp({
  publications,
  resolvePublicationDate,
  catalogueGeneration = "unspecified"
}) {
  const app = express();
  app.use(cors({ exposedHeaders: [CATALOGUE_GENERATION_HEADER] }));
  app.use((req, res, next) => {
    res.set(CATALOGUE_GENERATION_HEADER, catalogueGeneration);
    next();
  });

  app.get("/", (req, res) => {
    res.send("🌞 Diurnal API is running! Try /word");
  });

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      catalogueGeneration,
      publicationCount: publications.length,
      publicationTimezone: "Europe/London"
    });
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

  app.get("/publications", (req, res) => {
    const effectiveDate = resolvePublicationDate();
    const published = publications
      .filter(({ publicationDate }) => publicationDate <= effectiveDate)
      .toSorted((a, b) => b.publicationDate.localeCompare(a.publicationDate));

    res.json(published);
  });

  app.get("/publications/:id", (req, res) => {
    const effectiveDate = resolvePublicationDate();
    const publication = publications.find(
      ({ id, publicationDate }) =>
        id === req.params.id && publicationDate <= effectiveDate
    );

    if (!publication) {
      return res.status(404).json({
        error: "Publication not found.",
        code: "PUBLICATION_NOT_FOUND"
      });
    }

    res.json(publication);
  });

  app.use((req, res) => {
    res.status(404).json({ error: "Not Found", code: "NOT_FOUND" });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error("Unhandled request error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      code: "INTERNAL_SERVER_ERROR"
    });
  });

  return app;
}

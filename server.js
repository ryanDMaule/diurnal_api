import { createApp } from "./app.js";
import { createPublicationDateResolver } from "./publication-date.js";
import {
  CATALOGUE_GENERATION,
  publications,
  validatePublications
} from "./publications.js";

validatePublications(publications);
const resolvePublicationDate = createPublicationDateResolver();
const app = createApp({
  publications,
  resolvePublicationDate,
  catalogueGeneration: CATALOGUE_GENERATION
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Diurnal API running on port ${PORT}`);
});

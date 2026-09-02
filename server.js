import { createApp } from "./app.js";
import { createPublicationDateResolver } from "./publication-date.js";
import { publications, validatePublications } from "./publications.js";

validatePublications(publications);
const resolvePublicationDate = createPublicationDateResolver();
const app = createApp({ publications, resolvePublicationDate });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Diurnal API running on port ${PORT}`);
});

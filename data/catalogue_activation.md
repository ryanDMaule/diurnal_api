# Canonical catalogue activation

The 787-record canonical catalogue is materialized in `data/publications.json` for real-user testing.

- Catalogue generation: `diurnus-canonical-2026-10-16-v1`
- Publication timezone: `Europe/London`
- First publication: sequence 1, Diurnal, 2026-10-16
- Final publication: sequence 787, Trompe-l'œil, 2028-12-10
- Source order: `data/words_publication.json`
- Persisted word identities: `data/migration_preview/word_identity_map.json`
- Persisted publication identities and snapshots: `data/migration_preview/publications_2027_preview.json`
- Retired ledger backup: `data/migration_archive/publications_86_pre_activation.json`

Only publication dates differ between the preserved preview and the active materialization. Publication UUIDs, wordIds, sequences, order, definitions, usage examples, phonetics, types, and synonyms are unchanged.

The public publication JSON contract remains:

`id`, `sequence`, `publicationDate`, `word`, `type`, `phonetic`, `definition`, `usage`, `synonyms`

The stable catalogue generation is exposed on responses through the `X-Diurnus-Catalogue-Generation` header and through `GET /health`. `wordId` remains internal.

Empty synonym arrays are valid editorial data. The active catalogue contains two such approved records, Zeugma and Solipsism.

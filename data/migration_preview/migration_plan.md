# Diurnus 2027 Migration Preview Plan

This document records the reviewed migration design. The migration was materialized for real-user testing with a 2026-10-16 epoch; the original 2027 preview and identity map remain preserved as immutable source artifacts.

## 1. Proposed data model

### Editorial word

The six-field editorial schema remains unchanged in `data/words_master.json`:

- `word`
- `type`
- `phonetic`
- `definition`
- `usage`
- `synonyms`

`word_identity_map.json` stores a separate persisted UUIDv4 `wordId` for each exact headword. The identifier is independent of array position, shuffled order, dates, and publication UUIDs.

### Canonical publication

Each preview publication contains:

- immutable UUIDv4 `id`
- immutable integer `sequence`
- immutable `publicationDate`
- stable editorial `wordId`
- a complete six-field publication-time snapshot

The snapshot prevents later editorial changes from silently rewriting history. The reference permits future editorial tooling, bookmark reconciliation, and identity-safe corrections.

## 2. Differences from the current ledger

The retired `publications.js` ledger embedded 86 pre-release snapshots dated 2026-09-28 through 2026-12-22 and had no separate `wordId`. Its exact records are preserved in `data/migration_archive/publications_86_pre_activation.json`. The immutable preview remains dated 2027-01-01 through 2029-02-25. The active materialization in `data/publications.json` preserves its identities, order, and content while shifting dates to 2026-10-16 through 2028-12-10.

Only `Diurnal` occupies the same leading position. Preview UUIDs are new and do not alter or reuse current pre-release UUIDs.

## 3. Preserving API response shapes

The runtime can resolve `wordId` internally while returning the existing public fields only:

```text
id, sequence, publicationDate, word, type, phonetic, definition, usage, synonyms
```

`wordId` need not be exposed initially. `/word`, `/publications`, and `/publications/:id` can retain their current response and error shapes, exact-date rules, future filtering, and newest-first Archive ordering.

## 4. Backing up the 86 pre-release records

Before an approved cutover:

1. Copy the exact current ledger to a dated, immutable migration backup.
2. Record its SHA-256 checksum and Git commit.
3. Validate all 86 UUID/date/sequence/snapshot values against the backup.
4. Keep the backup out of the active runtime import path.
5. Do not reuse any pre-release UUID for a different canonical publication.

No backup is created by this preview because that would be part of an approved runtime migration.

## 5. Bookmark and saved-UUID risks

Replacing the pre-release ledger makes all existing pre-release publication UUIDs stale. A bookmark keyed only by one of those UUIDs will no longer resolve unless the app clears pre-release data or a temporary compatibility map is supplied.

Before release, decide whether pre-release app data is disposable. If it is not, create an explicit old-publication-ID to new-publication-ID mapping by normalised word identity. Never silently reuse old IDs.

## 6. Cached Today and Archive risks

Clients may retain pre-release dates, sequences, snapshots, and Archive pages after cutover. Mixing those with the 2027 ledger can display duplicate or contradictory identities. The app should treat the canonical ledger as a new data generation and invalidate pre-release Today/Archive caches atomically.

## 7. Distinguishing stale pre-release data

Introduce a persisted ledger generation identifier at migration time, for example `canonical-2027-v1`. It can be delivered through response metadata or a version endpoint without changing publication objects. Flutter should store the generation with cached data and clear incompatible caches when it changes.

The exact transport must be agreed before implementation; this preview does not change endpoints or headers.

## 8. Flutter migration/versioning option

On first response from the canonical generation:

1. Compare the server ledger generation with the locally stored generation.
2. If different, remove pre-release Today and Archive cache entries.
3. Either clear pre-release bookmarks or migrate them through an approved identity map.
4. Store canonical UUIDs and `wordId` only after the generation switch succeeds.
5. Make the operation transactional so an interrupted migration cannot mix generations.

No Flutter code is changed by this task.

## 9. Date boundary and future protection

Europe/London remains authoritative. Date resolution must continue using the existing IANA timezone logic. The canonical ledger must be validated for one record per consecutive calendar date, sequence/date agreement, unique IDs, and exact boundaries.

Archive and detail routes continue filtering `publicationDate <= effectiveDate`. Future IDs remain indistinguishable from unknown IDs. `/word` selects only the exact effective date, with no wrapping or fallback after 2028-12-10.

## 10. Rollback

Keep the archived 86-record ledger and pre-activation checksums available until the canonical migration is proven. A rollback should restore runtime data and the matching ledger-generation identifier together. Do not partially roll back only routes, dates, or UUIDs. Database rollback is unnecessary because the API is file-backed, but client cache generation must still match the active server ledger.

## 11. Approved migration sequence

Completed in this API change: the catalogue and identities were frozen, the 86-record ledger was archived, runtime loading and validation were added, endpoint publication shapes were preserved, a generation response header was defined, and focused boundary/identity tests were added.

Still required before deployment: update Flutter to consume the generation identifier and invalidate or migrate pre-release Today/Archive/bookmark state, verify that integration, then perform a separately approved manual deployment.

## Stable identity maintenance

Spelling or editorial corrections must update the existing identity-map entry in place while retaining its `wordId`. Tooling should fail when a master word no longer matches the map, forcing a reviewed rename operation rather than allocating a replacement identity. Reshuffling publication order never changes `wordId`.

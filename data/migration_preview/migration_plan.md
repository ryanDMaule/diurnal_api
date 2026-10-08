# Diurnus 2027 Migration Preview Plan

This plan is non-operative. The current 86-record ledger and API runtime remain authoritative until a separate migration is approved.

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

The current `publications.js` ledger embeds word snapshots but has no separate `wordId`. It contains 86 pre-release records dated 2026-09-28 through 2026-12-22. The preview contains 787 records dated 2027-01-01 through 2029-02-25 and follows `words_publication.json` exactly.

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

Archive and detail routes must continue filtering `publicationDate <= effectiveDate`. Future IDs must remain indistinguishable from unknown IDs. `/word` must continue selecting only the exact effective date, with no wrapping or fallback after 2029-02-25.

## 10. Rollback

Keep the existing runtime ledger and its checksum available until the canonical migration is proven. A rollback should restore runtime data and the matching ledger-generation identifier together. Do not partially roll back only routes, dates, or UUIDs. Database rollback is unnecessary because the current API is file-backed, but client cache generation must still match the active server ledger.

## 11. Future approved migration sequence

1. Review and approve this preview ledger and identity map.
2. Freeze the 787-word editorial inputs and preview UUID allocations.
3. Decide pre-release bookmark/cache disposal or mapping policy.
4. Define the ledger-generation transport.
5. Back up and checksum the 86-record ledger.
6. Add runtime loaders and validators for word references plus snapshots.
7. Preserve existing endpoint response shapes through an internal join/projection.
8. Add boundary, future-visibility, identity, and rollback tests.
9. Run a staging cutover using the 2027 epoch.
10. Verify Flutter cache migration separately.
11. Activate production only after explicit approval.

## Stable identity maintenance

Spelling or editorial corrections must update the existing identity-map entry in place while retaining its `wordId`. Tooling should fail when a master word no longer matches the map, forcing a reviewed rename operation rather than allocating a replacement identity. Reshuffling publication order never changes `wordId`.

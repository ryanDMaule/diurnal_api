# Rediscovery Design Preview

This document is design-only. It does not create or activate a rediscovery schedule.

## Canonical identity

Each word has one canonical publication containing an immutable publication UUID, sequence, publication date, `wordId`, and publication-time editorial snapshot. Archive, bookmarks, Recall, and progress identify the word through that canonical publication and `wordId`.

A rediscovery must never edit or duplicate that canonical record. In particular, it must not allocate another publication UUID, sequence, publication date, Archive entry, Recall word, or progress record.

## Proposed appearance record

A future daily appearance schedule can reference the existing publication:

```json
{
  "appearanceDate": "2030-01-01",
  "publicationId": "original-canonical-publication-uuid",
  "kind": "rediscovery"
}
```

`appearanceDate` describes when the word appears again; it is not a second publication date. Resolving the reference returns the original canonical snapshot unchanged. The Today response can therefore continue to show the canonical `publicationDate` as the word's original publication date.

The appearance dataset should be separate from the canonical publication ledger and excluded from Archive enumeration. Archive should deduplicate by canonical publication UUID as an additional defensive measure.

## Deterministic selection

The safest approach is an explicit, reviewed appearance schedule keyed uniquely by Europe/London calendar date. Given the same schedule and date, every client receives the same original publication. If algorithmic selection is introduced later, its seed, eligible set, algorithm version, and exclusion rules must be persisted so historical results remain reproducible.

Only publications whose original `publicationDate` is on or before the appearance date may be eligible. The schedule validator should reject unknown IDs, duplicate appearance dates, and references to future canonical publications.

## Client identity behavior

- Today resolves an appearance to the original publication UUID and snapshot.
- Bookmark keys remain the original publication UUID or stable `wordId`.
- Recall and progress resolve to the existing word; no new progress row is created.
- Archive continues to contain exactly one canonical entry.
- The original sequence and publication date remain visible and unchanged.
- Offline clients can reconcile a rediscovered response with an existing bookmark without migration.

## Compatibility note

The current `/word` implementation selects a canonical publication by exact `publicationDate`. Supporting rediscovery would require a future, explicitly approved resolution layer that checks an appearance schedule after the canonical schedule. That behavior is not implemented by this preview.

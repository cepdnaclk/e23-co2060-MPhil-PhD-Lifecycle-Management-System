# Department V1 Populated Migration and Recovery Rehearsal

**Date:** 27 July 2026

**Scope:** Final 17-migration Department V1 repository state

**Environment:** Disposable local PostgreSQL 15.18 on `127.0.0.1`

**Shared database:** Not accessed or modified

**Evidence handling:** Aggregate counts and schema facts only; no identities,
credentials, document locations, or record contents are recorded here

## Source and recovery artifacts

The rehearsal used the protected pre-Department-V1 backup
`pglms-before-department-v1.dump`. Its recorded SHA-256 checksum was:

`6c9fec4cb7522de84699e1cfe29dc6f1e636bb37c0da45ca1d2036746e0c53a5`

That custom archive was produced by PostgreSQL 17 and cannot be read by the
installed PostgreSQL 15 `pg_restore`. The backup set also contains a prepared
PostgreSQL-15-compatible plain SQL restore artifact. That artifact was replayed
successfully into the disposable database after removing only the empty
`public` schema that PostgreSQL 15 creates automatically. Its SHA-256 checksum
was:

`f1c5f6784e40084a54333f2dea9f4fb8f24108f5cde18336a476103e341e96c9`

Two untracked local recovery snapshots were then created and restored:

| Snapshot | Bytes | SHA-256 |
|---|---:|---|
| Pre-migration PostgreSQL 15 archive | 90,756 | `1d27886a37ee6f1c46cb057f3a43e1de3e42de0bd9953564720c30ff55093b68` |
| Post-migration PostgreSQL 15 archive | 202,228 | `5f09fcf7fc1408417649fccb94af51d57aea94db43d283759788b8a49955f378` |

The snapshots are deliberately excluded from Git because they contain database
records. The observed local timings were under one second for the compatible
SQL replay, under two seconds for migration deployment, and under four seconds
combined for both custom-archive recovery restores. These workstation timings
are rehearsal observations, not an approved production RTO.

## Pre-migration inventory

The restored source contained 25 public tables and five migration-ledger rows.
The aggregate application counts were:

| Table | Rows |
|---|---:|
| Users | 9 |
| Applications | 7 |
| Students | 6 |
| Registrations | 6 |
| Documents | 38 |
| Ethics approvals | 2 |
| Progress reports | 4 |
| Research proposals | 4 |
| Theses | 3 |
| Vivas | 2 |

There were no Students with duplicate registrations and no unsupported Student
programme types. The copy contained two `FINAL_ARCHIVE` theses and two legacy
submitted ethics records, providing populated examples for the final state
translations.

The ledger contained the expected successfully applied obsolete
`20260430160021_test` baseline and the checksum-reviewed superseding
`20260501173000_backlog_complete_init` baseline. The guarded reconciliation
script passed its dry run and then removed only the matching obsolete ledger
row when supplied with the exact confirmation value. Application table counts
did not change.

## Migration result

`prisma migrate status` identified 14 pending migrations, from
`20260718120000_add_maintenance_run_idempotency` through
`20260727090000_finalize_department_v1_conformance`.

`prisma migrate deploy` applied all 14 successfully. The resulting database:

- contains all 17 active repository migrations;
- reports `Database schema is up to date`;
- produces `No difference detected` from Prisma's database-to-schema drift
  check;
- preserves every aggregate application count listed above;
- contains 49 public tables and 18 ledger rows, including the retained
  rolled-back historical baseline attempt;
- contains four proposal-version backfills for the four existing proposals and
  no document migration issues.

## Post-migration invariants

Every targeted violation query returned zero:

| Check | Violations |
|---|---:|
| Students with duplicate registrations | 0 |
| Registrations without `expectedCompletionDate` | 0 |
| Unsupported Student programme types | 0 |
| Proposals without a version | 0 |
| Theses still using `FINAL_ARCHIVE` | 0 |
| Retired sign-off or registration-expiry notification events | 0 |
| Retired review-panel, panel-evaluation, progress-review, or reconciliation tables remaining | 0 |
| Retired registration columns remaining | 0 |

The database contains a unique index on `registrations.studentId`. The two
legacy thesis states became `ARCHIVED`. The two submitted ethics records became
`REQUIRED`, `PENDING`, and `SUPERVISOR_RECOMMENDATION`; the temporary
reconciliation table was removed.

## Recovery result

The pre-migration archive restored into a second empty local database with the
same 25 tables, five ledger rows, all ten listed application counts,
`expirationDate`, the obsolete applied baseline, and the original
`FINAL_ARCHIVE` states.

The post-migration archive restored into a third empty local database with the
same 49 tables, 18 ledger rows, all ten listed application counts,
`expectedCompletionDate`, no obsolete applied baseline, and the translated
`ARCHIVED` states. Prisma status and drift checks also passed against this
restored copy.

This proves both backup restoration to the pre-change state and restoration of
the exact migrated state. It does not authorize a shared-database migration.

## Repository verification

After recording this evidence, `git diff --check`, Prisma schema validation,
the 11-entry migration-policy check, lint, and type checking passed. The full
ordinary Vitest run passed 90 files and 325 tests; the guarded real-database
case was skipped in that ordinary run because it requires an explicit safe
`TEST_DATABASE_URL`.

## Remaining approval gates

- Review and accept this aggregate rehearsal and recovery evidence.
- Confirm the exact shared target, backup identifier, maintenance window, and
  rollback-versus-roll-forward decision.
- Review every `productionDeploymentBlocked` migration against the target's
  current row inventory; this backup cannot prove another environment has the
  same data shape.
- Obtain the named deployment approval before changing any blocker or running
  ledger reconciliation or migration deployment on the shared database.
- Complete isolated external-service tests for Firebase, Supabase Storage,
  scanning, SMTP, and authenticated browser flows.

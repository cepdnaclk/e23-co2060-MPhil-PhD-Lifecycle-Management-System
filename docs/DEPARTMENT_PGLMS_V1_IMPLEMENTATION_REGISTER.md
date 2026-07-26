# Department PGLMS Version 1 Implementation Register

## Baseline

| Field | Evidence |
|---|---|
| Date | 26 July 2026 |
| Branch | `main` |
| Commit | `c1a68e70f6d753262e93d4c71e98421395a3419e` |
| WP-04 ancestor | Yes; `HEAD` is the WP-04 commit |
| Working tree before checks | Clean |
| External services | Real PostgreSQL test unavailable without opted-in `TEST_DATABASE_URL`; authenticated Firebase/Supabase/SMTP E2E not configured |

## Pre-change verification

| Command | Result |
|---|---|
| `npm ci` | Passed; 1,069 packages installed |
| `npm run audit:production` | Passed high-severity gate; 6 documented moderate findings |
| `npm run audit:all` | Passed high-severity gate; 9 documented moderate findings |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run prisma:validate` | Passed |
| `npm run prisma:migrate:check` | Passed; two known populated-production blockers remain |
| `npm test` | Passed: 87 files / 286 tests; 1 guarded database test skipped |
| `npm run build` | Passed; 70 route/page units |
| `npm run test:database` | Unavailable/skipped: no opted-in safe test database |
| `npm run test:e2e` | Passed: 2/2 public Chromium/accessibility tests |

## Starting inventory

- 69 API route files and 37 page files.
- Four authenticated roles; no HOD.
- Programme enum also contains MSc and MEng.
- Application admission is an Administrator status mutation that immediately
  provisions the Student.
- Registration is renewable and expires annually.
- Progress is free-text and retains retired sign-off/panel/progress-Examiner
  artifacts.
- Ethics is document-only.
- Proposal Reviewers are not explicitly assigned.
- Thesis Examiner assignments do not require HOD confirmation.
- An assigned Examiner records the shared final viva outcome.
- Corrections use a Student-selected type and Administrator Boolean approval.
- Lifecycle audit/outbox models are absent.

## Phase tracker

| Phase | State | Exit evidence |
|---|---|---|
| D0 Scope and inventory | Implemented | Approved requirements, permission matrix, workflows, route catalogue, baseline evidence |
| D1 Audit and outbox | Implemented | Append-only database trigger, atomic helper, idempotent queue keys, lease/retry/dead-letter worker, Administrator recovery UI, 13 focused tests |
| D2 Core schema/reset | Implemented | Reviewed fail-closed migration, reset/seed commands, four exact programme rules, milestone calendar tests |
| D3 HOD identity | Implemented | HOD role/profile/claim, isolated route shell and navigation, HOD creation and redirect tests |
| D4 Application/proposal | Implemented | Public proposal, named-Supervisor consent, exact reviewer assignments/reviews, HOD decision and staff work queues |
| D5 Admission/milestones | Implemented | HOD gate, idempotent execution record, four exact fixed schedules, effective-dated Supervisor assignments |
| D6 Progress/tables/CSV | Implemented | Milestone return/resubmit/approve, four fixed tables, scoped complete formula-safe CSV and export audit |
| D7 Ethics | Implemented | Student declaration, Supervisor recommendation, PG Coordinator record, HOD confirmation, immutable decision history, and confirmed gate |
| D8 Thesis examination | Implemented | Primary-Supervisor readiness, pending exact-version assignment, HOD confirmation, independent reports |
| D9 Viva/corrections/completion | Implemented locally | Independent recommendations, HOD outcome, version-bound correction review, evidence-gated HOD completion approval, atomic PG Coordinator completion, confirmed graduation, and later archive |
| D10 UI/cleanup/docs | Implemented locally | Role workspaces, completion lifecycle queue, Student released-state display, retired route/model removal, and canonical docs exist; external deployment checks remain |

## Deployment limitations

Local completion will not make the system production-ready. The WP-04 populated
data rehearsal, real scanner/storage/concurrency tests, Firebase invitation and
session tests, SMTP verification, CSP enforcement approval, hosted CI/security
settings, deployment, and recovery evidence remain external release gates.

## D1 verification

| Command | Result |
|---|---|
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run prisma:validate` | Passed |
| `npm run prisma:migrate:check` | Passed; the two pre-existing populated-production blockers remain |
| Focused Vitest run | Passed: 3 files / 13 tests |

The existing signed maintenance job now claims an outbox batch, restores stale
leases, applies bounded exponential retry, and records every attempt. Failed or
dead-letter messages can be requeued through the Administrator-only recovery
page. The database prevents updates and deletes on lifecycle audit rows; any
correction must be expressed as a later compensating event.

## D2–D3 verification

| Command | Result |
|---|---|
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run prisma:validate` | Passed |
| `npm run prisma:migrate:check` | Passed; Department V1 core migration recorded as a third populated-production blocker |
| Focused Vitest run | Passed: 5 files / 22 tests before the dedicated HOD profile case was added |

The core schema now separates admission execution, milestone-bound versioned
progress, ethics state, thesis readiness, exact examiner reports, independent
viva recommendations, ordered corrections, programme completion, graduation,
and archive records. The migration refuses to coerce MSc/MEng data. The
idempotent seed path always restores the four approved programme rules and can
link one account for every role when existing Firebase UIDs are supplied via
`PGLMS_SEED_USERS_JSON`; credentials are never embedded in the repository.

## D4–D10 implementation and local verification

- Added intent-specific application, progress, ethics, readiness, examination,
  viva, correction, completion, graduation, archive, and progress-table APIs.
- Removed active renewal, review-panel, routine progress-Examiner, Supervisor
  sign-off, generic status, Examiner-outcome, Boolean correction approval,
  combined archive, legacy thesis-review, and production-test routes.
- Removed legacy panel/progress-review/sign-off models in
  `20260726150000_remove_retired_department_workflows`. Its checksum-pinned
  production block requires an approved export/retention decision and rehearsal.
- Added public Supervisor selection, Administrator reviewer assignment,
  Supervisor/Examiner review work, HOD decision queues, and fixed progress
  tables for Administrator/HOD/Supervisor.
- Final ordinary suite: 88 passing files / 312 passing tests; the guarded
  real-database test also passed 1/1 against a disposable PostgreSQL database.

The final route-to-target audit also closed three gaps found after the first
D4–D10 pass:

- one-time applicant proposal-revision capability, new exact proposal version,
  exact evidence binding, and fresh Reviewer assignments;
- removal of the active free-text progress path in favor of the earliest fixed
  milestone, immutable versions, and exact verified evidence;
- Student request → primary Supervisor certification → HOD approval before the
  first thesis submission, with examiner assignment gated on HOD approval.
- Student ethics declaration → Supervisor recommendation → PG Coordinator
  record → HOD confirmation with immutable decisions and a confirmed gate.
- HOD-derived corrections tied to the originating thesis version, sealed
  Student resubmission versions, primary-Supervisor certification, required
  independent Examiner approvals, and HOD closure.
- Completion approval bound to the exact verified current thesis version and
  gated by every fixed milestone, the HOD-confirmed ethics state, the final
  viva outcome, and closed corrections. PG Coordinator completion now updates
  the Student, fixed registration, thesis, audit, and outbox atomically;
  confirmed graduation and non-destructive archive remain later commands.
- Added
  `20260726231000_finalize_completion_graduation_archive_states`, which
  replaces legacy completion enums, exact-version-binds existing completion
  rows, and is checksum-pinned against populated deployment until its fail-closed
  backfill is rehearsed.

## Remaining release limitations

No known Department V1 completion-state delta remains in the local
implementation. The final populated-data migration and backup-recovery
rehearsal completed locally on 27 July 2026. Live
Firebase/Supabase/storage/scanner/SMTP checks, hosted CI evidence, acceptance
of the rehearsal, and deployment approval remain external release gates.

| Final command | Result |
|---|---|
| `npm run audit:production` | Passed configured high gate; 6 moderate transitive findings |
| `npm run audit:all` | Passed configured high gate; 9 moderate transitive findings |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run prisma:validate` | Passed |
| `npm run prisma:migrate:check` | Passed; eight checksum-pinned production blockers |
| `npm test` | Passed: 88 files / 312 tests; 1 guarded database test skipped |
| `npm run build` | Passed: 89 static pages generated and active route manifest compiled |
| `npm run test:e2e` | Passed: 2/2 public Chromium/accessibility tests |
| `npm run test:database` | Passed: 1/1 against a disposable PostgreSQL database after all 14 migrations |

## Final repository-wide conformance checkpoint — 27 July 2026

The final audit found that the earlier D10 statement overstated completion:
registration expiry/lapse remained active, the seed contained only programme
rules, and several retired pages and scripts still compiled or remained in the
tree. This checkpoint corrects that record.

- `Registration` is now unique per Student and contains an informational
  `expectedCompletionDate`; renewal, lapse, expiry gates, reminders, filters,
  and maintenance are removed.
- Thesis archive state is `ARCHIVED`; retired sign-off and expiry notification
  events are migrated to the neutral historical `SYSTEM_NOTICE` category.
- `npm run db:reset:sample` and `npm run database:reset` use the same guarded
  wrapper. It refuses production mode, non-local hosts, ambiguous database
  names, absent explicit opt-in, and all storage cleanup.
- The synthetic seed contains one HOD, one PG Coordinator, four Supervisors,
  four Examiners, four application-queue stages, two active Students for each
  programme/mode combination, and additional completed and graduated/archive
  records with milestones, ethics, readiness, examination, viva, correction,
  notification, and lifecycle-audit examples. It contains no passwords or
  real student data.
- The duplicate `/student/progress` route, generic `/dashboard/[role]` page,
  retired sign-off component, unsafe ad-hoc storage/database scripts,
  placeholder links, hard-coded profile identity, and dead Settings links are
  removed. `/api/cron/maintenance` now performs only overdue milestone, staged
  upload, and outbox work.
- Migration `20260727090000_finalize_department_v1_conformance` is
  checksum-pinned and blocked for populated deployment pending a sanitized
  rehearsal and registration duplicate review.

An isolated PostgreSQL 15 verification applied all 17 migrations, produced no
schema drift, seeded 20 synthetic users and 10 Students (8 active), and passed
the guarded real-database integration test. The shared database was not
modified.

Final verification passed: lint, type checking, schema validation, the
11-entry migration policy, 61 unit files/233 tests, 29 ordinary integration
files/92 tests with the guarded database case skipped there, the separate
1/1 real-database test, the 87-unit production route build, 2/2 public browser
and accessibility tests, and both high-severity dependency audit gates. The
audits continue to report the documented 6 production and 9 all-dependency
moderate transitive findings.

## Final populated migration and recovery rehearsal — 27 July 2026

The protected pre-Department-V1 populated backup restored into disposable
local PostgreSQL 15. The checksum-guarded obsolete-ledger reconciliation passed
its dry run and changed only the reviewed ledger row. All 14 pending migrations
then deployed successfully.

The ten tracked application-table counts were preserved, no duplicate
registrations existed, legacy archive and ethics states translated as designed,
all targeted conformance checks reported zero violations, migration status was
current, and Prisma reported no schema drift. Independent restoration of
checksum-recorded pre- and post-migration archives reproduced both database
states and their aggregate counts. The shared database was not accessed or
modified.

Detailed aggregate evidence and the remaining target-specific approval gates
are recorded in
`docs/operations/DEPARTMENT_V1_POPULATED_REHEARSAL_20260727.md`. All
checksum-pinned production blockers remain enabled until that evidence and the
deployment/recovery decision receive explicit project-owner approval.

## Hosted verification checkpoint — 27 July 2026

The exact rehearsal-evidence commit
`e0ba5c5f8e929c9620c0b0c05db69a4dd6d8af73` passed every configured hosted
job: CI Quality, Database migrations, Browser smoke, Secret scan, CodeQL
JavaScript/TypeScript analysis, and the Pages build/deployment.

The repository settings audit confirmed enabled secret scanning, push
protection, and vulnerability alerts. Weekly npm and GitHub Actions Dependabot
updates are configured in the repository.

Hosted governance is not complete: `main` is unprotected and therefore does
not require the green checks before changes land, while Dependabot security
updates are disabled. The active Copilot review-on-push ruleset does not enforce
status checks or pull-request review. These settings remain project-owner
Administrator actions; they were inspected read-only and were not changed.

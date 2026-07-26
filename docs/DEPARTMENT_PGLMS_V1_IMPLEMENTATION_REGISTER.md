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
| D9 Viva/corrections/completion | Partial | Independent recommendations, HOD outcome, verified version-bound correction submissions, Supervisor/Examiner reviews, and HOD closure exist; exact completion-state enums remain |
| D10 UI/cleanup/docs | Partial locally | HOD and assignment queues, role navigation, retired route/model removal, and canonical docs exist; completion-state alignment and external browser/DB checks remain |

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
- Final ordinary suite: 87 passing files / 306 passing tests; the guarded
  real-database test remains opt-in.

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

## Remaining functional deltas

This branch is not a complete implementation of every approved target rule:

1. Completion, graduation, and archive are separate records, but the legacy
   `AcademicStatus`, `RegistrationStatus`, and `ThesisStatus` enums do not yet
   express all target intermediate `COMPLETED`/`FAILED` states directly.

These are release blockers for claiming full Department PGLMS V1 conformance.

| Final command | Result |
|---|---|
| `npm run audit:production` | Passed configured high gate; 6 moderate transitive findings |
| `npm run audit:all` | Passed configured high gate; 9 moderate transitive findings |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run prisma:validate` | Passed |
| `npm run prisma:migrate:check` | Passed; seven checksum-pinned production blockers |
| `npm test -- --run` | Passed: 87 files / 306 tests; 1 guarded database test skipped |
| `npm run build` | Passed: 88 static pages generated and active route manifest compiled |
| `npm run test:e2e` | Passed: 2/2 public Chromium/accessibility tests |
| `npm run test:database` | Skipped safely: opted-in `TEST_DATABASE_URL` unavailable |

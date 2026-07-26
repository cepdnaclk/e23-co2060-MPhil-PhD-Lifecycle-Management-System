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
| D4 Application/proposal | Planned | Public proposal, assignments, revision, HOD decision |
| D5 Admission/milestones | Planned | Idempotent admission and four schedules |
| D6 Progress/tables/CSV | Planned | Return/resubmit/approve, fixed tables, complete safe export |
| D7 Ethics | Planned | Applicability, confirmation, readiness gate |
| D8 Thesis examination | Planned | Readiness, exact assignment, independent reports |
| D9 Viva/corrections/completion | Planned | Independent recommendations, HOD outcome and completion |
| D10 UI/cleanup/docs | Planned | Role shells, route crawl, accessibility, full verification |

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

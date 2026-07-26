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
| D1 Audit and outbox | In progress | Atomic audit/outbox and retry tests |
| D2 Core schema/reset | Planned | Prisma/migration/reset/seed and programme-rule tests |
| D3 HOD identity | Planned | Role/layout/API denial tests |
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

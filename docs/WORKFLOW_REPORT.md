# Department PGLMS Version 1 Workflow Report

Updated from the implemented repository state on 26 July 2026. This document
supersedes the former renewable-registration, review-panel, routine
progress-Examiner, Supervisor sign-off, and Examiner-outcome workflow report.

## Actors and authority

| Actor | Authority |
|---|---|
| Student | Own application evidence, assigned milestones, ethics evidence, thesis versions, and ordered correction submissions |
| Supervisor | Proposed-Supervisor consent; assigned proposal reviews; active primary-Supervisor progress/readiness, ethics, and correction certification |
| Examiner | Exact assigned proposal/thesis version report, independent viva recommendation, and required correction review |
| PG Coordinator (`ADMINISTRATOR`) | Operational intake, assignments, admission execution, scheduling, completion recording, graduation, archive, reporting, and outbox recovery |
| HOD | Department admission decision, examiner confirmation, final viva outcome, correction closure, and academic completion |

## Lifecycle

1. The public application captures M.Phil./Ph.D., full-/part-time mode, the
   proposal, and a named active proposed Supervisor.
2. The named Supervisor records consent. The PG Coordinator assigns two active
   Supervisor/Examiner Reviewers to the exact current application-proposal
   version.
3. Reviewers submit independent decisions. The HOD approves, rejects, or
   requires revision.
4. The PG Coordinator executes only an approved admission. The transaction
   creates the Student, fixed registration, expected completion date, exact
   six-calendar-month milestones, audit event, and durable welcome intent.
5. The Student submits a milestone-bound progress version. Only the active
   primary Supervisor may return or approve it; approval completes the
   milestone.
6. Student ethics declaration passes through Supervisor recommendation, PG
   Coordinator recording, and HOD confirmation; primary-Supervisor/HOD
   readiness then gates examination.
7. The PG Coordinator proposes exact current thesis-version Examiner
   assignments. The Examiner receives access only after HOD confirmation.
8. Confirmed Examiners submit independent reports and viva recommendations.
   The PG Coordinator schedules; the HOD records the final outcome.
9. Corrections are ordered from that outcome and originating thesis version.
   Verified Student resubmission versions pass primary-Supervisor certification,
   assigned-Examiner review when required, and final HOD closure.
10. HOD academic completion is bound to the exact verified thesis version and
    requires fixed milestones, ethics, viva, and correction evidence. The PG
    Coordinator then atomically completes the Student, registration, and thesis.
    Externally confirmed graduation and later non-destructive archive remain
    separate commands and records.

## Fixed programme rules

| Programme/mode | Registration | Milestones |
|---|---:|---:|
| M.Phil. full-time | 24 months | M1–M4 |
| M.Phil. part-time | 36 months | M1–M6 |
| Ph.D. full-time | 36 months | M1–M6 |
| Ph.D. part-time | 54 months | M1–M9 |

Registration is not renewable in Version 1. Expiry maintenance may mark the
fixed record lapsed and issue an informational reminder; it does not create a
new term.

## Integrity and delivery

- Domain transitions write append-only lifecycle events in the same database
  transaction.
- Critical notification intents use idempotent outbox keys, leases, bounded
  retry, attempt history, dead-letter state, and Administrator recovery.
- Completion, graduation, and archive each write their own audit event and
  durable notification intent; archive retains documents and does not alter
  the academic completion timestamp or Firebase identity.
- Document access remains assignment- and version-scoped; pending Examiner
  assignments do not confer thesis access.
- Four progress tables derive completion and overdue values from milestone
  records. Their CSV exports return every filtered row, neutralize spreadsheet
  formulas, use stable columns, and write an export audit event.

## Retired surfaces

The application no longer exposes review-panel membership/evaluation,
routine Examiner progress reviews, Supervisor sign-off, registration renewal,
generic application/proposal/thesis status mutation, Examiner viva outcome,
Administrator Boolean correction approval, combined archive/graduation, or a
production test route.

## Operations

The signed maintenance job still runs fixed-registration expiry checks,
milestone/progress overdue maintenance, and the transactional outbox worker.
Production deployment remains blocked until the populated-data migrations,
external identity/storage/email paths, and recovery evidence are rehearsed.

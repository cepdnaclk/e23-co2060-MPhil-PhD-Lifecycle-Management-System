# Department PGLMS Version 1 Workflows

This document defines the approved target workflows. The implementation
register records current evidence and the remaining ethics/correction deltas;
target arrows must not be read as proof that every stage is implemented.

## Application and admission

```text
SUBMITTED
→ ADMIN_COMPLETENESS_REVIEW
→ RETURNED_FOR_COMPLETION
→ SUPERVISOR_CONSENT_PENDING
→ PROPOSAL_REVIEW_PENDING
→ PROPOSAL_UNDER_REVIEW
→ PROPOSAL_REVISION_REQUIRED
→ HOD_DECISION_PENDING
→ HOD_APPROVED
→ ACCOUNT_CREATION_PENDING
→ ADMITTED
```

`HOD_REJECTED` is terminal. A revision creates a new verified proposal version
and new version-bound Reviewer assignments. Admission is an idempotent PG
Coordinator command and compensates a newly created Firebase identity if the
serializable database transaction fails.

## Fixed progress

```text
DUE → SUBMITTED → RETURNED → RESUBMITTED → COMPLETED
                  ↑                 |
                  └─────────────────┘
```

Each submission is an immutable `ProgressReportVersion`. Only the active
primary Supervisor performs the final return/approve action. Overdue means the
current time is later than `dueDate` and the milestone is not `COMPLETED`.

## Department-recorded ethics

```text
NOT_ASSESSED
→ NOT_APPLICABLE → Supervisor check → Admin record → HOD confirmation
→ APPLICABLE → SUBMITTED → REVISION_REQUIRED | APPROVED | REJECTED
```

The thesis gate passes only for HOD-confirmed not-applicable research or an
HOD-confirmed approved applicable case.

## Thesis examination

```text
Readiness requested
→ Supervisor certified
→ HOD approved for examination
→ verified thesis submitted
→ Examiner assignments proposed
→ HOD confirmed
→ independent reports submitted
→ viva scheduled
→ independent recommendations
→ HOD outcome
```

An Examiner assignment is bound to one thesis version and manifest. Examiner
reports and recommendations do not change the thesis state.

## Corrections and completion

```text
HOD outcome MINOR/MAJOR
→ order bound to the current examined thesis version
→ verified Student correction version and revised thesis version
→ primary Supervisor certification or return
→ independent assigned-Examiner approval when required
→ HOD approval or version-return
→ CORRECTIONS_APPROVED
→ HOD completion approval
→ Admin completion execution
→ graduation record
→ archive record
```

Correction type derives from the HOD outcome. Ordinary thesis resubmission
cannot bypass the correction requirement. Every return preserves the reviewed
version and opens the order for a new verified submission version.

## Transaction boundary

Every consequential command writes, in one transaction:

1. the domain change;
2. an append-only lifecycle audit event;
3. one or more deduplicated outbox messages.

Email and in-app delivery occur after commit through a leased worker.

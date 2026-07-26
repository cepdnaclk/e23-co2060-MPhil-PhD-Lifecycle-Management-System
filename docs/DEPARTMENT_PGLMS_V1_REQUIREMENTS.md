# Department PGLMS Version 1 Requirements

**Status:** Approved implementation baseline  
**Scope owner:** Department of Computer Engineering  
**Implementation baseline:** `c1a68e70f6d753262e93d4c71e98421395a3419e`  
**Source:** `PGLMS_DEPARTMENT_V1_CODEX_IMPLEMENTATION_PROMPT.md`

## Product boundary

Department PGLMS Version 1 supports only:

- M.Phil. and Ph.D. research programmes;
- full-time and part-time study modes;
- Students, Supervisors, Examiners, the Department PG Coordinator
  (`ADMINISTRATOR`), and the Head of Department (`HOD`);
- Department-owned decisions and operational records.

It does not represent CERPS, FHDC, Faculty Board, Senate, annual review
panels, registration renewal, fees, leave, extensions, programme transfers,
withdrawal, readmission, or multi-Department operation.

## Programme rules

| Programme | Study mode | Duration | Milestones |
|---|---|---:|---:|
| M.Phil. | Full-time | 24 calendar months | M1–M4 |
| M.Phil. | Part-time | 36 calendar months | M1–M6 |
| Ph.D. | Full-time | 36 calendar months | M1–M6 |
| Ph.D. | Part-time | 54 calendar months | M1–M9 |

Milestones are created during admission at exact six-calendar-month offsets.
Enrolment is the single server timestamp captured when the PG Coordinator
successfully executes an HOD-approved admission. Expected completion and
milestone dates derive from that timestamp.

## Required lifecycle

1. A public applicant submits programme, study mode, proposal, proposed
   Supervisor details, consent evidence, and supporting documents.
2. The PG Coordinator checks completeness and assigns proposal Reviewers.
3. Assigned Examiners review the exact proposal version.
4. The HOD approves, rejects, or requests a new proposal version.
5. The PG Coordinator executes an approved admission, creating the Firebase
   identity, local Student, registration, fixed milestones, Supervisor
   assignments, audit records, and notification intents.
6. The Student submits milestone-bound progress versions. The primary
   Supervisor returns or approves each version; approval completes the
   milestone.
7. Department-recorded ethics applicability and status pass through Student,
   Supervisor, PG Coordinator, and HOD checks.
8. The Student requests thesis readiness; the primary Supervisor certifies and
   the HOD approves examination.
9. The Student submits a verified logical thesis version. The PG Coordinator
   assigns Examiners and the HOD confirms exact-version assignments.
10. Examiners submit independent reports and viva recommendations. The PG
    Coordinator schedules the viva; the HOD records the final outcome.
11. A correction requirement is created from the HOD outcome. Versioned
    submissions are reviewed by the required Supervisor/Examiner and closed by
    the HOD.
12. The HOD approves academic completion. The PG Coordinator separately
    records completion, graduation, and later archive.

## Integrity and security requirements

- Keep the WP-01–WP-04 controls: local-role authority, claim consistency,
  revocation, CSRF/origin checks, safe email rendering, security headers,
  staged verified uploads, logical versions, manifest-bound reviews, central
  document authorization, and append-only document access events.
- Domain changes, lifecycle audit events, and notification outbox messages
  commit atomically.
- Examiners receive candidate access only from an explicit proposal or thesis
  assignment.
- HOD decisions require the HOD role; an Administrator may execute but may not
  manufacture academic approval.
- No generic status endpoint may bypass an intent-specific command.
- Critical notifications are durable, retryable, deduplicated, and linked to a
  permitted dashboard destination.

## Completion criteria

The implementation is complete only when the schema, migrations, services,
routes, role shells, four progress tables, full filtered CSV export, tests, and
documentation express this scope without active panel, renewal, MSc/MEng, or
progress-Examiner behavior.

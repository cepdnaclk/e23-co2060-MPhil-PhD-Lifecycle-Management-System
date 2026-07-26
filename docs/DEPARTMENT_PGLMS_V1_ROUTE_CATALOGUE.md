# Department PGLMS Version 1 Route Catalogue

Updated from the active repository surface on 26 July 2026. Common
authentication/session, notification, upload-session, document-repository, and
read-only profile/report routes are retained from WP-01–WP-04.

## Application and admission

| Method and route | Authorized actor | Purpose |
|---|---|---|
| `GET /api/public/supervisors` | Public | Sanitized active proposed-Supervisor choices |
| `POST /api/applications/drafts` | Public capability | Protected draft |
| `POST/DELETE /api/applications/upload` | Public capability | Staged evidence |
| `POST /api/applications` | Public capability | Finalize application and proposal v1 |
| `POST /api/applications/:id/proposal-revisions` | Scoped one-time public capability | Finalize a requested exact proposal version and renew Reviewer assignments |
| `POST /api/admin/applications/:id/start-review` | PG Coordinator | Begin review |
| `POST /api/applications/:id/supervisor-consent` | Named Supervisor | Consent/decline |
| `POST /api/applications/:id/proposal-reviewers` | PG Coordinator | Assign exact-version Reviewer |
| `POST /api/proposal-reviewer-assignments/:id/review` | Exact Reviewer | Independent review |
| `POST /api/hod/applications/:id/decision` | HOD | Department decision |
| `POST /api/admin/applications/:id/execute-admission` | PG Coordinator | Execute approved admission |

## Progress, ethics, and reporting

| Method and route | Authorized actor | Purpose |
|---|---|---|
| `POST /api/progress/milestones/:id/submit` | Owning Student | Submit/resubmit milestone version |
| `GET /api/student/progress-reports` | Owning Student | Fixed milestone schedule and immutable version history |
| `POST /api/student/progress-reports/upload-url` | Owning Student | Sealed optional evidence for the exact milestone version |
| `POST /api/supervisor/progress-reports/:id/decision` | Active primary Supervisor | Return/approve |
| `POST /api/ethics` | Owning Student | Finalize verified required-ethics evidence |
| `POST /api/student/ethics/declaration` | Owning Student | Declare that formal approval is not required |
| `GET /api/supervisor/ethics` | Assigned Supervisor | Scoped recommendation queue |
| `POST /api/supervisor/ethics/:id/recommendation` | Assigned Supervisor | Recommend or return the exact declaration revision |
| `POST /api/admin/ethics/:id/record` | PG Coordinator | Record proposed Department status |
| `POST /api/hod/ethics/:id/confirmation` | HOD | Confirm, return, or reject Department status |
| `GET /api/progress-tables` | PG Coordinator/HOD/assigned Supervisor | Four tables or complete CSV |
| `GET /api/admin/reports/*` | PG Coordinator | Operational reports/CSV |

## Thesis, examination, viva, and completion

| Method and route | Authorized actor | Purpose |
|---|---|---|
| `POST /api/student/thesis-readiness` | Owning Student | Request readiness before a thesis exists |
| `POST /api/supervisor/thesis-readiness/:id/certify` | Active primary Supervisor | Certify or return a Student request |
| `POST /api/hod/thesis-readiness/:id/approve` | HOD | Approve or return examination readiness |
| `POST /api/assignments/examiners` | PG Coordinator | Propose exact current-version assignment |
| `POST /api/hod/examiner-assignments/:id/decision` | HOD | Confirm/decline assignment |
| `POST /api/examiner-assignments/:id/report` | Confirmed exact Examiner | Independent report |
| `POST /api/vivas` | PG Coordinator | Schedule/reschedule |
| `POST /api/vivas/:id/recommendation` | Confirmed exact Examiner | Independent recommendation |
| `POST /api/hod/vivas/:id/outcome` | HOD | Final outcome |
| `POST /api/hod/vivas/:id/corrections` | HOD | Order outcome-matched corrections |
| `POST /api/student/corrections/:id/upload-url` | Owning Student | Prepare staged evidence for the HOD order |
| `POST /api/student/corrections/:id/submissions` | Owning Student | Finalize a verified correction and revised thesis version |
| `POST /api/supervisor/corrections/:id/review` | Active primary Supervisor | Certify or return the exact submission version |
| `POST /api/examiner/corrections/:id/review` | Assigned Thesis Examiner | Independently approve or return when required |
| `POST /api/hod/corrections/:id/decision` | HOD | Approve or return correction completion |
| `POST /api/hod/students/:id/completion` | HOD | Evidence-gated academic completion approval bound to the exact thesis version |
| `POST /api/admin/students/:id/completion` | PG Coordinator | Atomically complete the Student, registration, thesis, audit, and outbox |
| `POST /api/admin/students/:id/graduation` | PG Coordinator | Record externally confirmed graduation date and reference |
| `POST /api/admin/students/:id/archive` | PG Coordinator | Non-destructively archive after confirmed graduation |

The PG Coordinator operates these commands from
`/dashboard/admin/completions`; the Student sees only released lifecycle state
on `/dashboard/student/progress`.

## Audit, delivery, and maintenance

| Method and route | Authorized actor | Purpose |
|---|---|---|
| `GET /api/admin/outbox` | PG Coordinator | Delivery queue |
| `POST /api/admin/outbox/:id/retry` | PG Coordinator | Recover failed/dead-letter intent |
| `POST /api/cron/check-registrations` | Signed maintenance job | Fixed-term expiry, overdue, and outbox work |

## Retired surfaces

Removed rather than hidden:

- registration renewal;
- review panels, panel membership, and panel evaluation;
- routine Examiner progress reviews and release;
- legacy Supervisor sign-off;
- generic application/proposal/thesis status mutation;
- Examiner-controlled viva outcome;
- Administrator Boolean correction approval;
- combined graduation/archive commands;
- legacy thesis-review/release;
- production test routes.

Legacy proposal/thesis upload and version-download APIs retained from WP-04 are
document-integrity compatibility surfaces; they are not academic decision
routes.

The free-text progress submission service and thesis-bound Supervisor-only
readiness route are removed. The old Student progress URLs redirect to the
canonical fixed-milestone pages.

The active route surface now includes the role-separated ethics and correction
decision commands. Completion-state enum alignment remains recorded in the
implementation register.

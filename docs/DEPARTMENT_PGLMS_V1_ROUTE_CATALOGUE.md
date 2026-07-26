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
| `POST /api/supervisor/progress-reports/:id/decision` | Active primary Supervisor | Return/approve |
| `POST /api/ethics/students/:id/applicability` | Assigned Supervisor/PG Coordinator/HOD | Record applicability |
| `POST /api/ethics/:id/status` | PG Coordinator/HOD | Record Department status |
| `GET /api/progress-tables` | PG Coordinator/HOD/assigned Supervisor | Four tables or complete CSV |
| `GET /api/admin/reports/*` | PG Coordinator | Operational reports/CSV |

## Thesis, examination, viva, and completion

| Method and route | Authorized actor | Purpose |
|---|---|---|
| `POST /api/theses/:id/readiness` | Active primary Supervisor | Readiness decision |
| `POST /api/assignments/examiners` | PG Coordinator | Propose exact current-version assignment |
| `POST /api/hod/examiner-assignments/:id/decision` | HOD | Confirm/decline assignment |
| `POST /api/examiner-assignments/:id/report` | Confirmed exact Examiner | Independent report |
| `POST /api/vivas` | PG Coordinator | Schedule/reschedule |
| `POST /api/vivas/:id/recommendation` | Confirmed exact Examiner | Independent recommendation |
| `POST /api/hod/vivas/:id/outcome` | HOD | Final outcome |
| `POST /api/hod/vivas/:id/corrections` | HOD | Order outcome-matched corrections |
| `POST /api/correction-orders/:id/submissions` | Owning Student | Versioned correction response |
| `POST /api/hod/correction-orders/:id/approve-completion` | HOD | Close corrections |
| `POST /api/hod/students/:id/completion` | HOD | Academic completion |
| `POST /api/admin/students/:id/completion` | PG Coordinator | Record completion |
| `POST /api/admin/students/:id/graduation` | PG Coordinator | Record graduation |
| `POST /api/admin/students/:id/archive` | PG Coordinator | Archive after graduation |

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

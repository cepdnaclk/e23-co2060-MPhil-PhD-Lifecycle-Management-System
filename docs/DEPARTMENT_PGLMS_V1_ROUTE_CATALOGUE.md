# Department PGLMS Version 1 Route Catalogue

This catalogue is the target active surface. Routes omitted from this file are
not approved Version 1 workflow APIs.

## Public and Student

| Route | Purpose |
|---|---|
| `POST /api/applications/drafts` | Protected public upload capability |
| `POST/DELETE /api/applications/upload` | Upload/remove draft evidence |
| `POST /api/applications` | Finalize application and proposal |
| `GET /api/student/profile` | Own lifecycle profile |
| `GET /api/student/milestones` | Fixed schedule |
| `POST /api/student/milestones/:id/report` | First progress version |
| `POST /api/student/milestones/:id/resubmit` | New returned-report version |
| `GET/POST /api/student/ethics` | Own ethics case/evidence |
| `POST /api/student/thesis-readiness` | Request readiness |
| `POST /api/student/theses` | Verified thesis version |
| `POST /api/student/corrections/:id/submissions` | Versioned correction response |

## Supervisor and Examiner

| Route | Purpose |
|---|---|
| `GET /api/supervisor/students` | Assigned candidates |
| `GET /api/supervisor/milestones` | Assigned milestone queue |
| `POST /api/supervisor/progress-reports/:id/reviews` | Return/approve |
| `POST /api/supervisor/ethics/:id/review` | Ethics check/recommendation |
| `POST /api/supervisor/thesis-readiness/:id/certify` | Certify/return |
| `POST /api/supervisor/corrections/:id/review` | Correction review |
| `GET /api/examiner/proposal-assignments` | Exact proposal assignments |
| `POST /api/examiner/proposal-assignments/:id/evaluation` | Structured review |
| `GET /api/examiner/thesis-assignments` | Exact thesis assignments |
| `POST /api/examiner/thesis-assignments/:id/report` | Independent report |
| `POST /api/examiner/vivas/:id/recommendation` | Independent recommendation |
| `POST /api/examiner/corrections/:id/review` | Assigned correction review |

## Administrator and HOD

| Route | Purpose |
|---|---|
| `POST /api/admin/applications/:id/return` | Completeness return |
| `POST /api/admin/applications/:id/proposal-reviewers` | Assign Reviewers |
| `POST /api/admin/applications/:id/execute-admission` | Execute approved admission |
| `POST/PATCH /api/admin/supervisor-assignments/:id?` | Effective-dated assignments |
| `POST /api/admin/thesis-examiner-assignments` | Propose assignment |
| `POST /api/admin/vivas` | Schedule/reschedule |
| `POST /api/admin/completions/:studentId/execute` | Execute completion |
| `POST /api/admin/graduations/:studentId` | Record graduation |
| `POST /api/admin/archive/:studentId` | Archive record |
| `GET /api/admin/progress-tables` | Four server-backed tables |
| `GET /api/admin/progress-tables/export` | Complete filtered CSV |
| `GET/POST /api/admin/outbox/:id?` | Recovery and retry |
| `POST /api/hod/applications/:id/decision` | Application decision |
| `POST /api/hod/ethics/:id/confirm` | Ethics confirmation |
| `POST /api/hod/thesis-readiness/:id/approve` | Examination approval |
| `POST /api/hod/thesis-examiner-assignments/:id/confirm` | Assignment confirmation |
| `POST /api/hod/vivas/:id/outcome` | Final viva outcome |
| `POST /api/hod/corrections/:id/decision` | Correction closure |
| `POST /api/hod/students/:id/completion-approval` | Academic completion approval |
| `GET /api/hod/audit` | Department lifecycle history |
| `GET /api/hod/reports` | Department reports |

## Retired surfaces

The following are removed rather than hidden:

- registration renewal;
- review-panel and panel-evaluation APIs;
- progress Examiner-review APIs;
- legacy Supervisor sign-off APIs;
- generic application/proposal/thesis status mutation APIs;
- Examiner-controlled viva outcome;
- Administrator-only Boolean correction approval;
- production test routes and inert version routes.

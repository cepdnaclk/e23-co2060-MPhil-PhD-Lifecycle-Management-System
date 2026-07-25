# PGLMS Master System Audit, Workflow Reference, and Progress Register

**Document ID:** PGLMS-MASTER-001  
**Implementation baseline version:** 1.0  
**Report revision:** 1.3<br>
**Audit date:** 18 July 2026  
**Audited branch:** `main`  
**Audited commit:** `653ff632e0cecb6114f50e6fb525ebe2cb592942` — “Implement postgraduate lifecycle workflow updates”  
**Repository:** `e23-co2060-MPhil-PhD-Lifecycle-Management-System`  
**Document status:** Current implementation baseline, prioritized remediation plan, and living progress register  
**Canonical source:** This Markdown file.  
**DOCX status:** The existing DOCX remains the revision 1.0 implementation snapshot and is intentionally deferred until the remediation programme is complete or an interim copy is requested.
**Active remediation checkpoint:** WP-01 is committed at `9949fb8` and remains pending deployment/reconciliation evidence. WP-02 is implemented and verified locally as of 25 July 2026; hosted branch protection, first CI/CodeQL runs, populated-data migration rehearsal, external-service E2E, and deployment evidence remain pending. The audited implementation baseline has not changed.

> **Source-of-truth rule.** This report describes the behavior implemented at the audited commit. It supersedes the workflow claims in `docs/WORKFLOW_REPORT.md` and `output/pdf/pglms_admin_handover_report.*` where those documents conflict with the current code. Update the document control, capability matrix, change register, and risk register whenever the system changes.

## Document control and maintenance

| Field | Current value | Maintenance rule |
|---|---|---|
| Baseline owner | Project team | Assign a named product/technical owner after review. |
| Implementation baseline | Commit `653ff632...` on `main` | Replace only after the revised code is verified. |
| Requirements baseline | Observable behavior in source, schema, migrations, routes, UI, and tests | Add links to an approved SRS/BRD when one exists. |
| Verification baseline | Audited commit: 79 files / 243 tests and production build passed. WP-01 committed checkpoint: 82 files / 264 tests, Prisma validation, and production build passed. WP-02 local checkpoint: clean install, lint/type checks, 81 files / 263 tests passed plus one real-database test, migration/drift checks, build, two browser smokes, and zero high/critical audit findings on 25 July 2026. | Re-run after every material lifecycle change; distinguish local verification from hosted/deployed verification. |
| Review cadence | At each accepted change set and before a release | Record the date, owner, evidence, and changed capability/risk IDs. |
| Change states | Proposed, Approved, In progress, Implemented, Verified, Deferred, Rejected | “Implemented” is not “Verified”; retain evidence for both. |
| Capability states | Full, Partial, Backend-only, Retired, Missing, Operational verification required | Use the definitions below consistently. |
| Remediation plan | Section 17, revision 1.3; WP-01 committed/deployment pending; WP-02 locally implemented/hosted enforcement pending | Execute work packages in dependency order; a risk closes only with the package's acceptance and required hosted/deployment evidence. |

### Capability status legend

| Status | Meaning |
|---|---|
| **Full** | The observed capability has an end-to-end path, role checks, persistence, and usable UI for its current design. It may still have lower-priority improvement items. |
| **Partial** | A meaningful portion exists, but an expected stage, control, notification, UI, or integrity guarantee is incomplete. |
| **Backend-only** | Service/API support exists, but no complete user-facing workflow exposes it. |
| **Retired** | A route/model/label remains, but the active service intentionally returns `410 Gone` or the current migration removed the behavior. |
| **Missing** | No implementation path was found. |
| **Operational verification required** | The repository references the capability, but deployment/runtime evidence is outside the repository and was not available. |

## 1. Executive summary

PGLMS contains most of the major records and lifecycle stages needed to manage a postgraduate candidate: public application, admission, registration, supervisor assignment, proposal submission, ethics-document submission, progress reports, thesis submission, examiner assignment, viva scheduling, corrections, and graduation/final archive. Four authenticated roles—Student, Supervisor, Examiner, and Administrator—have role-scoped APIs and dashboards. A searchable document repository, email delivery log, in-app notifications, admin reports APIs, test suite, and Sentry integration are also present.

The current version is **not yet a dependable end-to-end lifecycle implementation**. Several features are structurally present but are not usable as complete workflows. The highest-impact findings are:

1. `POST /api/auth/claims` is unauthenticated and can set a Firebase role claim and local database role, including Administrator. This is a critical privilege-escalation path.
2. Examiner review attachments are linked directly to the student and are included in the general repository before an administrator releases the review, creating a high-risk confidentiality breach.
3. Proposal and thesis submissions legitimately allow up to ten files, but their download/version services require exactly one current document. A valid multi-file submission therefore breaks history and current-download workflows.
4. Proposal, progress-report, and thesis examiner-review services exist, but assignment/discovery, source-document access, review forms, release presentation, and notifications are incomplete or absent from the UI.
5. Supervisor sign-off and legacy review panels are retired, but overdue logic, schema fields, route names, labels, and old documentation still assume sign-off. Consequently, every submitted progress report eventually becomes “overdue” with no active way to clear it.
6. Ethics is now document-only. There is no approval/rejection/revision state, yet downstream progress and thesis logic treats any ethics package as clearance.
7. Viva outcome entry is a single examiner-controlled value without per-examiner recommendations, quorum, comments, date enforcement, or administrative ratification. The first examiner can move the thesis to its next status.
8. Several notification events are missing, mislabeled, fire-and-forget, or not retryable. Important transitions—including application rejection, viva outcome, corrections required, and correction approval—can be silent.
9. Upload metadata is often committed before the browser finishes uploading to object storage. A failed upload can leave a valid-looking submission, trigger notifications, and produce a missing file.
10. The dependency audit reported 40 known vulnerabilities in the installed production dependency graph: 1 critical, 11 high, 26 moderate, and 2 low. Direct affected packages include Next.js, Nodemailer, Firebase, Firebase Admin, Sentry, and PostCSS.

> **WP-01 local checkpoint, not deployed.** The working-tree patch removes the public claims route, makes review-attachment access release- and parent-aware, converts maintenance to signed fail-closed POST with a database run ledger, and temporarily limits proposal/thesis submissions to one file. These changes have passed local verification, but findings 1–3 remain open operational risks until deployment and reconciliation are evidenced; RISK-003 also requires the WP-04 logical-version redesign for closure.

Quality gates have materially improved but are not yet fully hosted: at the audited commit, the production build completed and all 79 Vitest files / 243 tests passed. WP-01 subsequently passed all 82 files / 264 tests, Prisma validation, a focused 10-file / 49-test security-regression set, and a production build before being committed at `9949fb8`. WP-02 adds strict lint/type gates, locked-install audits, disposable-PostgreSQL migration/drift testing, public Playwright/accessibility smoke tests, secret scanning, CodeQL, Dependabot, and a production build on Next.js 16. The 25 July local checkpoint passed 81 files / 263 ordinary tests, the separately gated real-database test, and two public browser smokes. Firebase, Supabase Storage, SMTP, authenticated browser flows, hosted repository settings, deployment, and runtime security-header evidence remain outside this local checkpoint.

### Baseline verdict

| Area | Verdict |
|---|---|
| Major lifecycle records | Mostly implemented |
| Role-scoped API access | Broadly implemented, with one critical claims bypass and several policy inconsistencies |
| Role responsibilities | Partially aligned; Supervisor and Examiner responsibilities are substantially narrower in the UI than backend/domain names imply |
| Dashboards | Functional KPI/link launchers; metrics and destinations contain several misleading or dead states |
| Workflow completeness | Partial; admissions and basic submissions are strongest, while formal review/release/finalization governance is incomplete |
| Notifications/email | Partial; many triggers work, but coverage, taxonomy, durability, retry, and deep links are incomplete |
| Document handling | Partial; signed storage is present, but versioning, upload finalization, review confidentiality, and content verification need redesign |
| Production readiness | Not established by repository evidence |

## 2. Audit scope, method, and limitations

### 2.1 What was inspected

The audit covered:

- Prisma schema, 24 models, 12 enums, and all migrations;
- 65 API route files and their HTTP methods, authentication wrappers, service calls, and retired behavior;
- 37 page routes, shared layouts, 57 components, role navigation, dashboards, forms, tables, loading/error/empty states, and accessibility indicators;
- lifecycle services for applications, registration, proposals, ethics, progress reports, examiner reviews, theses, viva, corrections, documents, archives, reports, notifications, email, Firebase, and Supabase Storage;
- all 83 test/spec files: 79 Vitest unit/integration-style files and 4 Playwright files;
- project scripts, dependencies, environment-variable usage, Sentry/Next configuration, Git state, and existing documentation;
- a production build, full Vitest run, targeted workflow tests, and a current `npm audit --omit=dev` snapshot.

### 2.2 Evidence collected

| Check | Result |
|---|---|
| `npm test` | Passed: 79 files, 243 tests |
| `npm run build` | Passed: Prisma generation and Next.js production build completed; 69 routes/pages generated |
| Targeted backend test set | Passed: 46 tests across 21 files |
| Repository state before report | Clean `main` worktree at audited commit |
| API route files | 65 |
| UI page files | 37 |
| Component files | 57 |
| Prisma models/enums | 24 / 12 |
| Dependency audit | 40 findings: 1 critical, 11 high, 26 moderate, 2 low |

#### WP-01 local verification checkpoint — not a new deployment baseline

| Check | Result |
|---|---|
| Focused WP-01 regression suite | Passed: 10 files, 49 tests |
| Full `npm test` | Passed: 82 files, 264 tests |
| `npx prisma validate` | Passed |
| `npm run build` | Passed: Prisma generation, compile, application type/lint checks, and static-page generation completed; `/api/auth/claims` is absent from the route manifest |
| Runtime/deployment verification | Pending: no production migration, scheduler cutover, reconciliation, or authenticated smoke test was performed |

### 2.3 Limitations and interpretation

No approved external Software Requirements Specification, Business Requirements Document, or acceptance-test catalogue was found. A few source comments refer to `REQ-FN-018`, `REQ-FN-019`, and `REQ-FN-020`, but they are not a complete requirement set. Therefore, “fulfilled requirement” in this report means **an observable capability implemented by the audited repository**, not formal contractual acceptance.

The audit did not have production data, a live Firebase project, live Supabase bucket, SMTP inbox, deployed headers, scheduler, backup policy, or authenticated browser accounts. Runtime-only behavior is explicitly marked for operational verification. No application code was modified during the original audit; the later WP-01 working-tree changes are recorded separately and do not replace the audited deployment baseline.

## 3. System purpose and lifecycle scope

PGLMS is a postgraduate lifecycle management web application intended to centralize the journey from prospective applicant to final thesis archive. Despite the repository name and product branding, the implementation accepts four programme types: MPhil, PhD, MSc, and MEng (`prisma/schema.prisma:17-22`).

The implemented lifecycle is:

```text
Public application
  → administrator review/admission
  → student account + active registration
  → supervisor assignment
  → proposal submission/decision
  → ethics evidence submission
  → progress reporting and optional examiner review
  → thesis submission
  → examiner assignment and optional examiner review
  → viva scheduling/outcome
  → corrections when required
  → administrator finalization/graduation
  → record/document retention
```

Not every arrow is enforced. In particular, examiner reviews are not mandatory before decisions or viva, ethics has no decision, and some generic status endpoints can bypass specialized workflows.

## 4. Architecture and technology stack

### 4.1 Logical architecture

| Layer | Current implementation | Notes |
|---|---|---|
| Web/UI | Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/Radix components | Server and client components; role dashboards under `/dashboard`. |
| API | Next.js Route Handlers under `src/app/api` | JSON APIs; most protected handlers use `withAuth`. |
| Domain/services | TypeScript modules under `src/lib` | Lifecycle rules, validation, notifications, storage paths, reports. |
| Authentication | Firebase Authentication and Firebase Admin session cookies/custom role claims | Seven-day absolute session, 30-minute inactivity window. |
| Authorization | Firebase role claim plus local active-user lookup; resource checks in services | Database role is not compared on each request. |
| Database | PostgreSQL accessed through Prisma; repository configuration targets Supabase | Domain records and notification logs. |
| File storage | Supabase Storage using service-role credentials and 15-minute signed URLs | Client-to-storage upload is common. |
| Email | Nodemailer over SMTP | Every attempted email is intended to create `NotificationLog`. |
| In-app notifications | `Notification` table and sidebar drawer | Recent eight items only; bulk mark-all-read. |
| Monitoring | Sentry Next.js integration | Production browser source maps enabled; runtime configuration requires verification. |
| Testing | Vitest, Testing Library, jsdom, Playwright | Playwright is not wired into the standard test script. |

### 4.2 Dependency versions at the audited commit

| Purpose | Package/version |
|---|---|
| Framework | Next.js 14.2.28 |
| UI runtime | React / React DOM 18.3.1 |
| Language | TypeScript 5.8.3 |
| ORM | Prisma / `@prisma/client` 5.22.0 |
| Authentication | Firebase 10.14.1; Firebase Admin 12.7.0 |
| Storage client | `@supabase/supabase-js` 2.105.x |
| Validation | Zod 3.24.1 |
| Email | Nodemailer 6.10.1 |
| Data fetching | SWR 2.3.3 |
| Styling/components | Tailwind 3.4.17, Radix, shadcn, Lucide |
| Monitoring | `@sentry/nextjs` 10.51.x |
| Unit/integration-style tests | Vitest 2.1.8, Testing Library |
| Browser tests | Playwright 1.51.1 |

Source: `package.json:5-64`.

### 4.3 Configuration inventory

| Concern | Environment keys referenced by code |
|---|---|
| Database | `DATABASE_URL` (Prisma deployment configuration) |
| Supabase | `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`; `SUPABASE_SERVICE_ROLE_KEY`; `SUPABASE_STORAGE_BUCKET` or public fallback |
| Firebase Admin | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |
| Firebase browser app | `NEXT_PUBLIC_FIREBASE_API_KEY`, auth domain, project ID, storage bucket, sender ID, app ID, measurement ID, with non-public fallbacks in the client module |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, optional `SMTP_FROM` |
| Application links | `APP_BASE_URL` |
| Session naming | Optional `SESSION_COOKIE_NAME`, `SESSION_ACTIVITY_COOKIE_NAME` |
| Maintenance | Optional `CRON_SECRET`; optional `PROGRESS_REPORT_OVERDUE_AFTER_DAYS` |
| Sentry | `SENTRY_ORG`, `SENTRY_PROJECT`, and platform-provided Sentry configuration |

At the audited commit, environment files were ignored but no `.env.example` existed. WP-02 now supplies a placeholder-only `.env.example`, including separate development and guarded test-database settings; environment validation and secret provisioning remain deployment responsibilities.

### 4.4 Deployment and operations status

- `npm run build` runs `prisma generate && next build`; `npm start` runs `next start` (`package.json:5-14`).
- No Dockerfile, Vercel configuration, Kubernetes manifests, or release/deployment workflow was found.
- **WP-02 local checkpoint:** the empty sync workflow is removed and CI/CodeQL/Dependabot configuration now covers locked install, lint, type checking, unit/mocked integration tests, audits, build, disposable-PostgreSQL migrations/drift, one real-database test, public browser/accessibility smoke, secret scanning, and SAST. Required hosted checks and deployment automation remain to be configured/verified.
- No scheduler definition was found for registration/progress maintenance.
- No backup, restore, disaster-recovery, retention, or data-deletion policy is represented in the repository.
- Security headers are not set in `next.config.mjs` or middleware. They may exist at a deployment edge and must be verified at runtime.
- `next.config.mjs:4-6` sets `productionBrowserSourceMaps: true`; confirm that source maps are uploaded privately and removed from the public artifact.

## 5. Canonical domain model and state machines

### 5.1 Core records

| Record | Role in the lifecycle | Key implementation note |
|---|---|---|
| `User` | Identity, role, activation | One optional role profile; local role can drift from Firebase claim. |
| `Student` | Candidate, programme, academic state | Has `isArchived` and academic status in addition to user activation. |
| `Application` | Public admission application | Applicant is not a `User` until admission. |
| `Registration` | Time-bounded enrolment period | Multiple historical rows; no DB guarantee of exactly one active row. |
| `ResearchProposal` | Current proposal metadata/status | Logical versions are inferred from `Document.version`. |
| `EvaluationForm` | Proposal examiner feedback | No proposal examiner assignment; release fields have no active update workflow. |
| `EthicsApproval` | Submitted ethics document package | Despite its name, it has no decision/status in the current schema. |
| `SupervisorAssignment` | Primary/co-supervisor link | Maximum and primary rules exist only in application code. |
| `ProgressReport` | Period narrative/report | Legacy sign-off/overdue fields remain. |
| `ProgressReportReview` | New examiner review for a report | Backend-only; review release is not surfaced. |
| `ReviewPanel` and related models | Legacy review-panel design | Routes/services are retired, but schema remains. |
| `Thesis` | Thesis metadata and state | File versioning is represented by document rows. |
| `ThesisExaminerAssignment` | Examiner assignment and review | Assignment also stores review/release data. |
| `Viva` | Single scheduled viva and shared outcome | One outcome for all examiners, no per-examiner recommendation. |
| `CorrectionDocument` | Correction package and admin approval | No rejection state or decision note. |
| `Document` | Polymorphic stored-file metadata | Multiple nullable parents; no DB check that exactly one parent is set. |
| `Notification` | In-app user message | No action URL or individual-read API. |
| `NotificationLog` | Email-delivery/download audit record | Event taxonomy is frequently reused incorrectly. |

Model and enum definitions: `prisma/schema.prisma:10-557`.

### 5.2 Implemented state transitions

#### Application

```text
SUBMITTED → UNDER_REVIEW | ADMITTED | REJECTED
UNDER_REVIEW → ADMITTED | REJECTED
ADMITTED → terminal
REJECTED → terminal
```

Repeating the current state is accepted. Source: `src/lib/prisma/application-status.ts:3-31`.

#### Proposal

```text
SUBMITTED → UNDER_REVIEW | APPROVED | REJECTED
UNDER_REVIEW → APPROVED | REJECTED
REJECTED → SUBMITTED
APPROVED → terminal
```

A rejected proposal can be revised. Source: `src/lib/prisma/proposal-status.ts:3-39`.

#### Registration

```text
ACTIVE + expired → LAPSED
renew any registration → archive current ACTIVE if present + create new ACTIVE period
```

Renewal is not an approval workflow. Source: `src/lib/registrations.ts:66-80,147-229`.

#### Thesis advertised transition map

```text
SUBMITTED → UNDER_EXAMINATION
UNDER_EXAMINATION → CORRECTIONS_REQUIRED | FINAL_ARCHIVE
CORRECTIONS_REQUIRED → SUBMITTED | FINAL_ARCHIVE
FINAL_ARCHIVE → CLOSED
CLOSED → terminal
```

Source: `src/lib/prisma/thesis-status.ts:3-28`. Viva `FAIL` directly sets `CLOSED`, bypassing this map.

#### Viva outcome mapping

```text
PASS              → FINAL_ARCHIVE
MINOR_CORRECTIONS → CORRECTIONS_REQUIRED
MAJOR_CORRECTIONS → CORRECTIONS_REQUIRED
FAIL              → CLOSED
```

Source: `src/lib/vivas.ts:115-149,192-255`.

#### Student academic state

`ACTIVE`, `UNDER_REVIEW`, `GRADUATED`, and `ARCHIVED` exist, but transitions are not centralized. Specialized thesis finalization sets `GRADUATED`; record archival sets `ARCHIVED`; generic thesis status changes can leave them inconsistent.

### 5.3 State consistency warning

“Archive” currently has four different meanings:

1. `RegistrationStatus.ARCHIVED` — a superseded registration period;
2. `Student.isArchived` / `AcademicStatus.ARCHIVED` — administrative record retention;
3. `ThesisStatus.FINAL_ARCHIVE` — successful academic finalization stage;
4. `Thesis.isArchived` — a soft-archive flag that current finalization does not set.

These must not be treated as interchangeable.

## 6. Observed capability/requirements coverage

| ID | Observable capability | Current status | Evidence/qualification |
|---|---|---|---|
| CAP-001 | Public multi-step programme application | Full for the current basic design | Four steps, validation, PDF/ZIP evidence, success page. No save/resume or applicant tracking. |
| CAP-002 | Administrator application review and admission | Partial | Status transitions and admission provisioning work; under-review UI and applicant rejection notification are missing. |
| CAP-003 | Student/Firebase account provisioning | Partial | Account, claim, profile, and registration created; insecure temporary-password delivery and collision handling remain. |
| CAP-004 | Registration period and renewal | Partial | Active/lapsed/archive periods and renewal work; no approval, payment/evidence, UI, idempotency, or graduated-user blocking. |
| CAP-005 | Supervisor assignment | Partial | Admin create/promote/remove with limits; concurrency, history, removal notices, and student notices are missing. |
| CAP-006 | Proposal submission, revision, and admin decision | Partial | Core flow exists; multi-file versions break, admin evidence is incomplete, and examiner review is not required. |
| CAP-007 | Assigned proposal examiner review | Missing/partial backend | Review endpoint exists without assignment, queue, usable source-document access, or UI. |
| CAP-008 | Formal ethics approval | Missing under current design | Ethics is a document package only; decision route returns `410`. |
| CAP-009 | Progress-report submission and supervisor monitoring | Partial | Submission/history/monitoring exist; upload finalization and overdue meaning are flawed. |
| CAP-010 | Supervisor progress-report sign-off | Retired | Both sign-off paths return `410`; labels and fields remain. |
| CAP-011 | Progress review panels | Retired | Legacy panel endpoints return `410`; schema remains. |
| CAP-012 | Examiner progress-report review and admin release | Backend-only | Create/submit/release services exist; no usable queue/UI/notifications/student release view. |
| CAP-013 | Thesis submission and revision | Partial | Preconditions and submission exist; ethics is not approved, multi-file versions break, upload finalize is absent. |
| CAP-014 | Thesis examiner assignment | Partial | Admin can assign and email examiner; link expires quickly, no removal/reassignment/count rule, limited notification. |
| CAP-015 | Thesis examiner report and admin release | Backend-only | Submit/release API exists; no UI, no notifications, no student retrieval of released review. |
| CAP-016 | Viva scheduling | Full for a simple single-viva design | Future date, venue, upsert, student/examiner notifications. No calendar integration or review prerequisites. |
| CAP-017 | Governed viva decision | Partial/high risk | One examiner sets one shared outcome; no quorum, report, comments, date check, or ratification. |
| CAP-018 | Correction submission and approval | Partial | Student package and admin approval exist; type mismatch, rejection, review notes, download UI, and notices are missing. |
| CAP-019 | Final archive and graduation | Partial | Specialized action graduates and notifies; status/archive/registration/account consistency is incomplete. |
| CAP-020 | Administrative record archival | Partial | Soft-archives selected records; active registrations, theses, documents, assignments, account, and Firebase access remain. |
| CAP-021 | Role-scoped document repository | Partial | Search/filter/signed download and admin soft delete exist; review confidentiality and thesis supervisor policy conflict remain. |
| CAP-022 | In-app notification centre | Partial | Recent items and mark-all-read work; badge, unread total, refresh, deep links, pagination, and individual read are missing. |
| CAP-023 | Email delivery and audit log | Partial | SMTP send and SENT/FAILED log exist; taxonomy, retry, durability, HTML escaping, and complete coverage are missing. |
| CAP-024 | Role dashboards | Partial | Responsive KPI/action shell exists; metrics, dead links, profile identity, drill-downs, trends, and reports need work. |
| CAP-025 | Administrator operational reports | Backend-only | Student, graduation, thesis-pipeline, overdue, under-review, and archive APIs have no dashboard pages. |
| CAP-026 | Lifecycle/audit history | Missing | Status fields overwrite history; only email attempts and a subset of downloads are logged. |
| CAP-027 | Automated maintenance | Operational verification required/partial | Endpoint exists; scheduler absent, secret fail-open, reminders not deduplicated. |
| CAP-028 | Production monitoring | Operational verification required | Sentry wrapper exists, but deployed DSN, alerts, dashboards, and source-map exposure were not verified. |
| CAP-029 | Automated quality gates | Partial | WP-02 adds CI/CodeQL/Dependabot definitions, strict static/test/build/audit gates, disposable PostgreSQL migrations/drift, one real-database test, and public browser/accessibility smoke. Hosted enforcement, external-service/authenticated E2E, and deployment evidence remain pending. |
| CAP-030 | Accessibility/responsive baseline | Partial | Good component primitives and responsive grids; landmarks, labels, reduced motion, live regions, zoom, and mobile behavior need verification/fixes. |

## 7. Roles, responsibilities, and permissions

### 7.1 Role responsibility summary

| Actor | Responsibilities currently exposed | Responsibilities implied but not fully supported |
|---|---|---|
| Public applicant | Complete application, upload/remove draft documents, submit | Save/resume, reference number, status tracking, receive under-review/rejection notices |
| Student | Maintain own profile fields, submit proposal/ethics/progress/thesis/corrections, view own lifecycle/documents/notifications, renew registration through API | Request-based renewal, see released examiner feedback, receive all decisions, control staged uploads, formally acknowledge requirements |
| Supervisor | View assigned roster/profile, monitor proposal state and progress-report narratives/documents, browse assigned-student repository | Proposal evaluation, progress sign-off, review comments, milestone approval; these are retired or not implemented despite route names |
| Examiner | View assigned thesis documents/vivas, record viva outcome; backend can submit proposal/progress/thesis reviews in limited ways | Discover assigned review work, access proposal/progress evidence, submit reports in UI, follow corrections, provide independent viva recommendation |
| Administrator | Manage users, applications, status decisions, assignments, viva, corrections/finalization, documents, notification log; access report APIs | Evidence-first decision queues, review release UI, report dashboards, retry failed messages, consistent audit trail, safe claims management |

### 7.2 Permission matrix

Legend: **C** create/submit; **R** read/list/download; **U** update/decide; **A** administrative management; **—** no intended access; **B** backend-only/limited.

| Domain | Applicant | Student | Supervisor | Examiner | Administrator |
|---|---:|---:|---:|---:|---:|
| Application draft/upload/submit | C/U | — | — | — | R/U decision |
| User accounts | — | own session | own session | own session | C/R/deactivate |
| Registration | — | R/U renew own (API only) | R via roster | — | R/U renew |
| Supervisor assignment | — | R indirectly | R own assignment | — | C/R/U/delete |
| Proposal | — | C/R revisions | R assigned student | B review without assignment; source files denied | R/U status |
| Ethics package | — | C/R | R through repository if assigned | — | R/download; no decision |
| Progress reports | — | C/R | R assigned, view-only | B assigned review submit | B assign/release; report monitoring |
| Thesis | — | C/R own | Repository can expose assigned-student thesis despite specialized denial | R assigned | R/U status |
| Thesis examiner assignment | — | — | — | R own assignment | C/R |
| Thesis examiner review | — | no release view | — | B submit via API | B release via API |
| Viva | — | notification/progress only | — | R assigned/U shared outcome | C/U schedule/R |
| Corrections | — | C/R own | R through repository | no usable follow-up UI | R/U approve/finalize |
| Documents | — | R own scope | R assigned-student scope | R assigned-thesis only | A all/soft delete |
| Notifications | — | R/mark all | R/mark all | R/mark all | R/mark all + delivery log |
| Reports/archive | — | — | — | — | API-only reports; archive action/list |

### 7.3 Important authorization behavior

Most protected APIs call `withAuth`, which accepts a valid bearer token or Firebase session cookie, looks up an active local user, and authorizes the role from the decoded Firebase claim (`src/lib/firebase/auth.ts:81-108,132-166`; `src/lib/firebase/with-auth.ts:24-56`).

The local `User.role` is not selected or compared. A stale or malicious claim can therefore remain authoritative even if the database role changes. More seriously, the unauthenticated claims endpoint can create that drift deliberately; see RISK-001 in the final section.

Role layouts do not consistently authenticate on the server. APIs protect data, but an anonymous or wrong-role user can render another role’s dashboard shell/navigation before API requests fail. Role enforcement belongs in each role layout, not only in selected pages.

## 8. Dashboard and user-interface inventory

### 8.1 Public routes

| Route | Purpose | Current notes |
|---|---|---|
| `/` | Landing page | Apply Now and Sign In actions. |
| `/apply` | Four-step application | Applicant, Research, Documents, Review. Up to ten PDF/ZIP files. |
| `/apply/success` | Confirmation | No application reference or tracking link. |
| `/login` | Firebase sign-in and server session creation | Role directs dashboard destination. |
| `/logout` | Clear server cookies and redirect | Does not explicitly revoke Firebase sessions/tokens. |

### 8.2 Shared dashboard shell

The shared role layout provides a responsive sidebar, active navigation, notifications drawer, sign-out, header, profile menu, loading/error/empty patterns, and a `max-w-7xl` content area. Dashboard summaries refresh every 30 seconds and on focus through SWR.

Current shell problems:

- the profile is hard-coded as `Administrator / admin@pdn.ac.lk` for every role (`src/components/profile-dropdown.tsx:17-35`);
- Profile and Settings link to nonexistent `/dashboard/settings`; the generic `[role]` page renders a bogus workspace instead;
- the real sidebar uses a custom notification trigger that omits the component’s unread badge;
- non-admin headings can render “Student Dashboard Dashboard” and equivalent duplicates;
- role layouts do not consistently validate the authenticated user/role server-side.

### 8.3 Student dashboard and pages

| Surface | Current functionality | Accuracy/gap |
|---|---|---|
| Overview KPIs | Active Registrations; Proposal Reviews; Ethics Approvals; Overdue Reports; Open Thesis Milestones | “Ethics Approvals” counts packages, not approvals. Overdue derives from obsolete sign-off. |
| Quick actions | Submit/view progress, proposal status, ethics, thesis, corrections | Useful route launcher; no recent activity or deadlines. |
| Proposal | Create/revise, multi-file upload, history/download, status | Multi-file download/history conflict. |
| Ethics | Submit package, history/download | UI correctly reflects document-only design; downstream labels do not. |
| Progress | Narrative/files submission and history | Displays obsolete sign-off state; upload can fail after DB commit. |
| Lifecycle progress | Milestones, percentages, estimated completion, stepper | Treats submissions/files as approvals and can show false completion. |
| Thesis | Submit/revise/history/download | Multi-file conflict; correction-required status permits alternate resubmission path. |
| Corrections | Submit/history/download | Student chooses type without enforcing viva result. |
| Documents | Search/filter/download own scope | Can expose unreleased review attachments. |

There is also an unlinked duplicate `/student/progress` route in addition to `/dashboard/student/progress`.

### 8.4 Supervisor dashboard and pages

| Surface | Current functionality | Accuracy/gap |
|---|---|---|
| Overview KPIs | Assigned Students; Submitted Proposals; Submitted Reports; Graduated Students | Counts include broader history than labels imply. |
| Roster | Programme/registration filters, assignment type, expiry, proposal title | Useful operational list. |
| Student profile | Programme/status/enrolment and workflow cards | “View Proposal History” and “Open Progress Reports” are `href="#"`. |
| Proposal page | Informational monitoring notice | Route is named `/proposals/evaluate`, but no evaluation occurs. |
| Progress page | View narrative and attached filenames | Component/route still says sign-off though it is view-only. |
| Documents | Assigned-student repository | Includes thesis documents despite specialized thesis access denying supervisors. |

The “Student Roster” quick action links to supervisor home rather than the roster.

### 8.5 Examiner dashboard and pages

| Surface | Current functionality | Accuracy/gap |
|---|---|---|
| Overview KPIs | Assigned Theses; Scheduled Vivas; Pending Corrections; Active Examinations | Counts include historical/completed data and correction files rather than cases. |
| Vivas | Candidate, abstract, current thesis download, venue/date, outcome buttons | Time is omitted in the card; outcome governance is insufficient. |
| Documents | Thesis-only repository for assigned theses | No proposal/progress evidence access. |
| Quick actions | Review theses/vivas; Track Corrections | Track Corrections returns home; no correction screen. |

There is no UI for proposal evaluation, progress-review assignment work, progress review submission, thesis review report, review attachments, or released-feedback handling, even though some backend services exist.

### 8.6 Administrator dashboard and pages

| Surface | Current functionality | Accuracy/gap |
|---|---|---|
| Overview KPIs | Active Staff; Pending Applications; Archived Theses; Overdue Reports; Ethics Documents; Students Under Review; Failed Notifications | Several definitions are misleading; no trends or drill-down tables. |
| Users | Create, filter, deactivate | No edit/reactivate/reset/search/pagination/self-deactivation guard. |
| Applications | List submitted, detail/download, admit/reject | Under-review records disappear from list; rejection has no reason. |
| Proposals | Approve/request revision with comment | Does not display source evidence or examiner evaluations despite instructing admin to review them. |
| Ethics | List/view/download package | No decision, intentionally. |
| Supervisor assignment | Create/remove/promote primary/co-supervisor | Good basic controls; concurrency/history/notifications incomplete. |
| Examiner assignment | Assign examiner and begin examination | No remove/reassign/count policy; one emailed file link. |
| Viva scheduling | Schedule/reschedule | No review/examiner-count prerequisites. |
| Thesis finalization | Approve correction; archive and graduate | Correction files are listed without open/download action; decisions lack notes/confirmation. |
| Documents | Global repository and soft delete | No retention workflow. |
| Notification log | Filter, paginate, current-page CSV | No retry/resend; CSV is only the loaded page. |

Backend-only admin surfaces: student report, graduation report, thesis pipeline, overdue progress, students under review, archived-record browser, progress review assignment/release, thesis review release, and registration renewal.

### 8.7 Cross-cutting UI/accessibility findings

Strengths include responsive grids, table overflow, disabled mutation controls, Radix dialog/select/sheet primitives, and widespread loading/error/empty states.

Current accessibility and UX risks include:

- animated loaders without accessible status text or reduced-motion handling;
- continuous landing animation without `prefers-reduced-motion` support;
- `min-width: 360px`, which can fail 320px/400% zoom scenarios;
- no skip link and weak landmark structure, including nested `<main>` elements;
- missing label/control associations in several forms and selects;
- async feedback without consistent live regions or focus management;
- an icon-only remove-supervisor button without an accessible label;
- hidden mobile-sidebar close behavior and uncertain close-on-navigation;
- inconsistent native `alert()`/`confirm()` versus accessible dialogs;
- no authenticated browser verification of keyboard order, contrast, zoom, or mobile reflow.

## 9. End-to-end workflow reference

This section describes the current executable workflow, including preconditions, persistence, notifications, and known divergence. “Current result” describes what the audited code does, not what a future policy should require.

### 9.1 Workflow A — public application and admission

**Actors:** Applicant, Administrator  
**Entry:** `/apply`  
**Primary records:** `Application`, application `Document`, then `User`, `Student`, `Registration`

#### Current sequence

1. The applicant enters name, email, telephone, programme, proposed supervisor text, research area, and statement of purpose.
2. The applicant selects one to ten PDF/ZIP files, each with a declared maximum of 10 MB.
3. The browser obtains a 15-minute Supabase signed upload URL through a public API and uploads each file before the application record exists.
4. The browser submits metadata including storage paths. The server validates Zod shape, claimed MIME/size, protected root, and duplicate active application by email.
5. The server creates `Application(SUBMITTED)` and file metadata, then emails every active administrator.
6. Administrator opens the application, downloads evidence, and chooses a permitted status.
7. If `ADMITTED`, the server creates a Firebase user, assigns the `STUDENT` custom claim, creates local `User` and `Student(ACTIVE)`, creates a one-year `Registration(ACTIVE)`, links the application, and sends a welcome email.
8. If `UNDER_REVIEW` or `REJECTED`, only the database status changes.

Evidence: `src/lib/applications/submission.ts:84-135,176-321,324-480`; `src/app/api/applications/[id]/status/route.ts:24-59`.

#### Communications

- Submission: active administrators receive email, logged under `APPLICATION_STATUS_CHANGED`; no in-app notification.
- Admission: new student receives welcome email containing temporary password; no explicit in-app item is needed before first login.
- Under review/rejected: no applicant communication.

#### Current completion and flaws

- **Implemented:** public form, evidence upload, duplicate check, admin review/download, status transition, account/profile/registration provisioning.
- **Not implemented:** applicant reference/status page, save/resume, review ownership, rejection reason, public-recipient notification history.
- Public draft upload/delete is not rate-limited and remains possible using a retained draft identity. Upload uses `upsert`; there is no committed-application lock or object-existence verification.
- Admission cannot reuse/link an existing local user with the applicant email.
- Temporary password generation uses `Math.random()` and sends a reusable password in plaintext (`src/lib/applications/submission.ts:56-65,395-460`; `src/lib/email.ts:240-263`).

### 9.2 Workflow B — user sign-in, session, and role authorization

**Actors:** All authenticated roles  
**Primary records/services:** Firebase Auth, Firebase Admin, `User`, secure cookies

#### Current sequence

1. Browser signs in through Firebase and receives an ID token.
2. `POST /api/auth/session` verifies the token, looks up the linked active local user, creates a Firebase session cookie, and sets an activity cookie.
3. Cookies are `HttpOnly`, `Secure`, `SameSite=Lax`, path `/`; absolute lifetime is seven days and inactivity timeout is 30 minutes (`src/lib/firebase/admin.ts:114-151`; `src/lib/security/session.ts:1-10`).
4. Protected APIs accept a bearer token or the session cookie, verify Firebase, require an active local user, and authorize the token claim role.
5. The client activity tracker periodically refreshes the activity cookie.
6. Logout clears both application cookies and redirects home.

#### Current flaws

- Local database role and Firebase claim are not compared on each request (`src/lib/firebase/auth.ts:88-108`).
- `POST /api/auth/claims` has no authentication or authorization and can set arbitrary supported role claims/local roles.
- Role layouts do not consistently block anonymous/wrong-role shell rendering.
- Logout clears local cookies but does not explicitly revoke all Firebase refresh/session tokens; stolen sessions remain bounded mainly by verification/revocation state and expiry.
- Cookie-authenticated mutation routes do not implement visible CSRF tokens or strict Origin/Referer validation. `SameSite=Lax` is useful but not a complete control.

### 9.3 Workflow C — registration maintenance and renewal

**Actors:** Student, Administrator, scheduled maintenance  
**Primary record:** `Registration`

#### Current sequence

1. Admission creates an active period ending one year after admission.
2. A student owner or Administrator may call the renewal API for any registration.
3. The service archives the current active period, if present, and creates a new one-year active period.
4. If the current expiry is in the future, the new period starts from that expiry; otherwise it starts now.
5. Maintenance marks expired active rows `LAPSED`.
6. On exactly 14 days before expiry, maintenance emails and creates an in-app reminder.

Evidence: `src/lib/registrations.ts:66-145,147-229`; `src/app/api/registrations/[id]/renew/route.ts:11-42`.

#### Current flaws

- No UI exposes renewal.
- Renewal is immediate, with no request, evidence, fee/payment, approval, or reason.
- Repeated early renewal can extend indefinitely; concurrent renewals can create multiple active rows because there is no database invariant/idempotency key.
- Finalization and record archive do not close registrations; graduated/archived students can be reminded and can renew.
- `GET /api/cron/check-registrations` changes state. If `CRON_SECRET` is absent, it deliberately authorizes every request (`src/app/api/cron/check-registrations/route.ts:6-24`).
- No scheduler is committed. Exact-day reminders can be missed or duplicated and have no delivery deduplication.

### 9.4 Workflow D — supervisor assignment

**Actors:** Administrator, Supervisor, Student  
**Primary record:** `SupervisorAssignment`

#### Current sequence and rules

1. Administrator selects a student and active supervisor.
2. The first assignment is forced to Primary.
3. Application code enforces maximum three supervisors, maximum two co-supervisors, and one primary.
4. Promoting an assignment demotes the current primary transactionally.
5. A person already serving as examiner for the student cannot be assigned as supervisor.
6. New supervisor receives an email naming student, role, and assigning administrator.
7. Administrator can delete an assignment; the row is permanently removed.

Evidence: `src/lib/assignments/supervisors.ts:83-208,215-427`.

#### Current flaws

- Limits are not database constraints and can be violated by concurrent requests.
- Student receives no assignment/change notice; supervisor receives no promotion/removal notice.
- Assignment email is logged as `APPLICATION_STATUS_CHANGED`.
- Deleted assignments lose history; no start/end dates or reason.
- Archived/graduated student state is not checked.

### 9.5 Workflow E — proposal submission, revision, examination, and decision

**Actors:** Student, assigned Supervisor (monitor only), Examiner (backend review), Administrator  
**Primary records:** `ResearchProposal`, proposal `Document`, `EvaluationForm`

#### Student submission

1. Student must have an admitted linked application and an unexpired active registration.
2. Browser uploads one to ten PDF/ZIP documents through signed URLs.
3. First proposal is `UNDER_REVIEW` when any supervisor is assigned, otherwise `SUBMITTED`.
4. A rejected proposal can be revised: metadata is updated, integer version increments, prior documents are marked non-current, and the proposal returns to the initial state.
5. Approved proposal is terminal.

Evidence: `src/lib/proposals/submission.ts:113-268,325-480`.

#### Examiner evaluation backend

1. There is no proposal-examiner assignment model or examiner queue.
2. Any Examiner who learns a proposal ID can submit one evaluation while the proposal is submitted/under review, unless they are also the student’s supervisor.
3. Any non-conflicted Examiner can retrieve the evaluations collection, including other examiner feedback/admin fields.
4. Examiner proposal version access is explicitly denied by the proposal service, and the general repository only permits thesis documents for Examiners.
5. Admin UI does not load the evaluation or proposal evidence.

Evidence: `src/lib/proposals/evaluations.ts:186-243,312-455`; denial at `src/lib/proposals/versions.ts:126-159`.

#### Administrator decision and notifications

Administrator can approve or reject/request revision directly; no evaluation is required. A status change sends email and in-app notification to the student. Optional feedback is included in the email but is not persisted as a decision record.

#### Multi-file failure

Every file within the new logical version is marked `isCurrentVersion=true` (`src/lib/proposals/submission.ts:375-384,417-446`). The versions service throws unless exactly one document across the proposal is current (`src/lib/proposals/versions.ts:111-123`). Thus a valid multi-file package immediately breaks history/download.

### 9.6 Workflow F — ethics evidence

**Actors:** Student, Administrator  
**Primary records:** `EthicsApproval`, ethics `Document`

#### Current sequence

1. Student must have an approved proposal and active registration.
2. Student submits one non-archived ethics package with one to ten PDF/ZIP files.
3. Active administrators receive email and in-app notification.
4. Administrators can list and download the evidence.
5. There is no decision. `PATCH /api/admin/ethics/[id]/decision` always returns `410 Gone`.

The current migration deliberately removed ethics status, reviewer, review notes, and review timestamps. Evidence: `src/lib/ethics/approvals.ts:152-255,293-455`; migration `prisma/migrations/20260709090000_lifecycle_examiner_reviews_and_multi_uploads/migration.sql:26-34`.

#### Consequences

- Any ethics package is treated as clearance in thesis preconditions and student progress.
- No approval, rejection, revision, exemption, expiry, committee, or certificate can be represented.
- The name `EthicsApproval` and KPI “Ethics Approvals” overstate the implemented behavior.

### 9.7 Workflow G — progress reporting and review

**Actors:** Student, assigned Supervisors, Administrator, Examiner  
**Primary records:** `ProgressReport`, progress `Document`, `ProgressReportReview`

#### Student submission and supervisor monitoring

1. Student needs an unexpired active registration; academic/archive state is not checked.
2. Student enters a free-text period label and narrative, with zero to ten optional files.
3. Server creates the report and document metadata transactionally, then returns signed upload URLs.
4. Browser uploads the files after the API response.
5. Every active assigned supervisor receives background email and an in-app notification.
6. Supervisors can view assigned students’ reports, narratives, and filenames only.

Evidence: `src/lib/progress-reports/submission.ts:76-140,172-309`.

#### Retired sign-off and panel design

- `PATCH /api/progress-reports/[id]/sign-off` and `POST /api/supervisor/progress-reports/[id]/sign` return `410`.
- Review-panel create/read/evaluate routes return `410`.
- Legacy sign-off fields, review-panel models, names, badges, and tests remain.

Evidence: `src/lib/progress-reports/sign-off.ts:3-23`; `src/lib/review-panels/index.ts:16-45`.

#### Examiner-review replacement

```text
Administrator assigns Examiner
  → assigned Examiner submits one immutable text review + optional attachments
  → Administrator adds comments and releases/unreleases the review
```

Supervisor conflict is checked. The backend does not provide a usable examiner list/queue UI, assignment notification, submission notification, admin release screen, or student/supervisor released-review view.

Review attachments are created with the student ID (`src/lib/progress-reports/reviews.ts:343-357`). The general repository grants a Student any document with their ID (`src/lib/documents.ts:94-154`), without checking `releasedAt`. A student can therefore access an unreleased examiner attachment.

#### Overdue defect

Maintenance marks an existing report overdue after 30 days while `isSupervisorSignedOff=false`. Because sign-off is retired and no active flow sets the flag, every submitted report eventually becomes overdue. The logic does not detect a missing expected report; it only ages submitted reports.

### 9.8 Workflow H — thesis submission and document versioning

**Actors:** Student, Administrator, assigned Supervisors (email/repository), Examiners  
**Primary records:** `Thesis`, thesis `Document`

#### Preconditions and sequence

1. Student must be academically active, have an approved proposal, have an unexpired active registration, and have at least one ethics package.
2. Student submits title, abstract, and one to ten PDF/ZIP files.
3. First submission creates `Thesis(SUBMITTED)` and file metadata.
4. When the current thesis is `CORRECTIONS_REQUIRED`, the same thesis can be resubmitted as the next version and reset to `SUBMITTED`, without using or waiting for correction-package approval.
5. The server commits metadata before returning signed upload URLs; the browser performs storage PUTs afterward.
6. Active administrators receive email. Assigned supervisors receive the progress-report email template with a synthetic period label such as `thesis submission: <title>`.

Evidence: `src/lib/theses/submission.ts:107-295,356-407,409-558`.

#### Multi-file failure

All files in the logical version are current (`src/lib/theses/submission.ts:439-546`). The download/version service requires exactly one current thesis document (`src/lib/theses/versions.ts:106-119`). Valid multi-file submissions therefore break student/examiner/viva current-download and make an integer version ambiguous.

### 9.9 Workflow I — thesis examiner assignment and report release

**Actors:** Administrator, Examiner  
**Primary record:** `ThesisExaminerAssignment`

#### Assignment

1. Administrator may assign an active Examiner while thesis is `SUBMITTED` or `UNDER_EXAMINATION`.
2. Duplicate and supervisor conflict checks are performed.
3. Assignment does not automatically set `UNDER_EXAMINATION`, require a minimum/maximum examiner count, or support removal/reassignment.
4. Examiner receives an email containing a 15-minute signed link to only the first current thesis document.

Evidence: `src/lib/assignments/examiners.ts:194-318`.

#### Review backend

1. Assigned Examiner can submit one immutable text review with optional attachments, even while thesis remains `SUBMITTED`.
2. Administrator can add comments and set/clear `releasedAt`.
3. The review is not required before viva scheduling or outcome.
4. No usable review UI, notification, or student released-review retrieval path exists.
5. Review attachments are linked to the student and leak through the repository before release, as described in Workflow G.

Evidence: `src/lib/theses/reviews.ts:127-281`.

### 9.10 Workflow J — viva scheduling and outcome

**Actors:** Administrator, assigned Examiner, Student  
**Primary record:** `Viva`

#### Scheduling

1. Thesis must be `UNDER_EXAMINATION` and the date must be in the future.
2. Administrator schedules or reschedules the one viva per thesis.
3. Student and every assigned Examiner receive email and in-app notification containing thesis, date/time, and venue.
4. Scheduling does not require an examiner count or submitted/released reviews.

#### Outcome

1. Any assigned Examiner may record the single shared outcome.
2. The service immediately maps the outcome to the thesis status.
3. There is no scheduled-date check, per-examiner recommendation, quorum/consensus, chair, comments/report, confirmation, recorded-by field, or administrative ratification state.
4. The first result changes the thesis status, preventing a second examiner from recording an independent view.
5. No outcome notification is sent.

Evidence: `src/lib/vivas.ts:115-149,192-345`.

### 9.11 Workflow K — corrections, approval, finalization, and graduation

**Actors:** Student, Administrator  
**Primary records:** `CorrectionDocument`, correction `Document`, `Thesis`, `Student`

#### Correction package

1. Student with own non-archived `CORRECTIONS_REQUIRED` thesis submits one to ten files, a description, and self-selected Minor/Major type.
2. Server creates unapproved correction metadata before browser file upload completes.
3. Active administrators receive email and in-app notification, using the `CORRECTIONS_REQUIRED` event even though the trigger is “correction submitted.”
4. Administrator may approve, setting approved flag/time/actor only.
5. Approval does not change thesis state or notify the student. There is no rejection state, decision reason, or requested revision.

#### Finalization

1. Administrator may finalize a `CORRECTIONS_REQUIRED` thesis with at least one approved correction, or an already `FINAL_ARCHIVE` thesis.
2. Service sets thesis status to `FINAL_ARCHIVE` and Student academic status to `GRADUATED`.
3. Student receives background archive email and in-app notification.
4. `Thesis.isArchived` and registration state are not updated; user account stays active.

Evidence: `src/lib/theses/corrections.ts:150-423,491-635`.

#### Current bypasses/inconsistencies

- Student correction type is not checked against viva outcome.
- One approved package is enough even if other packages remain pending.
- Student can instead submit a new thesis version while corrections are required.
- Generic admin thesis status can set states without synchronizing graduation or notifications.
- `FINAL_ARCHIVE` is not closed by the specialized finalization action.

### 9.12 Workflow L — administrative student-record archive

**Actors:** Administrator  
**Primary records:** `Student` plus related soft-archive flags

The archive command sets `Student.isArchived=true`, `AcademicStatus.ARCHIVED`, and archives linked application, proposal, ethics package, and progress reports. Active theses generate warnings but are not changed. Registrations, file metadata, supervisor/examiner assignments, notifications, local user activation, and Firebase access are left intact (`src/lib/admin/archive.ts:37-149`).

There is no restore/unarchive path. Some downstream services block `GRADUATED` but not `ARCHIVED`, so archived records can remain actionable. The archived-record list expects `Thesis.isArchived=true`, but current finalization does not set it.

### 9.13 Workflow M — document repository and downloads

**Actors:** All authenticated roles  
**Primary record:** `Document`

#### Current behavior

- Administrator: all non-deleted repository documents; can soft delete and can still download deleted items.
- Student: direct `studentId` documents and documents related to their application/proposal/ethics/progress/thesis/corrections.
- Supervisor: equivalent scope for assigned students.
- Examiner: thesis documents for assigned theses only.
- Download returns a Supabase signed URL valid for 15 minutes.
- Search supports text, category, tag, dates, pagination, and status-derived tags.

Evidence: `src/lib/documents.ts:63-266,359-430,816-1034`.

#### Policy and integrity problems

- `REVIEW_ATTACHMENT` is included in repository types (`src/lib/documents.ts:63-71`) and student/supervisor direct-ID scopes have no release check.
- Specialized thesis service explicitly denies Supervisors, while the general repository grants assigned Supervisors thesis documents.
- Examiner download audit covers only one current-thesis endpoint. Version downloads, repository downloads, and emailed signed links are not logged.
- `Document` has several nullable parent IDs and denormalized `studentId`; no database check enforces one valid parent or consistency.
- MIME and size are based mainly on client-declared metadata; no signature/content sniff, malware scan, checksum, or storage-finalize verification exists.

### 9.14 Workflow N — notification consumption and delivery audit

**Actors:** All authenticated roles; Administrator for delivery log

1. Notification sidebar fetches the most recent eight records once on mount.
2. Drawer displays title, message, event, and relative time.
3. User can mark all notifications read; no individual-read operation exists.
4. Notification records have no destination/action URL.
5. Administrator can filter and paginate `NotificationLog` and export the current loaded page to CSV.

The API does not return an authoritative unread count. The custom sidebar trigger omits the default badge, and the UI would otherwise estimate only from the eight fetched records. There is no polling/on-open refresh, “view all”, retry/resend, or failed-delivery repair flow.

## 10. Notifications and email trigger catalogue

### 10.1 Delivery architecture

`sendEmail()` sends through Nodemailer and records `SENT` or `FAILED` in `NotificationLog`; SMTP errors are converted into a result rather than thrown (`src/lib/email.ts:79-135`). The central `notify()` dispatcher sends email and then writes an in-app `Notification`; the two writes are not transactional (`src/lib/notifications.ts:147-365`). Several workflows bypass the dispatcher and send only email.

“Fire-and-forget” calls use unresolved background promises inside the request process. In serverless/short-lived runtimes, completion is not guaranteed. There is no outbox, job queue, retry schedule, idempotency key, or dead-letter state.

### 10.2 Master trigger matrix

| Trigger | Recipient | Channel actually used | Subject/title and main content | Stored event classification | Current issue |
|---|---|---|---|---|---|
| Public application submitted | All active Administrators | Email + email log | `New <programme> application submitted`; applicant, email, research area | `APPLICATION_STATUS_CHANGED` | No in-app; event misclassified |
| Application set under review | Applicant | None | — | — | Silent; applicant is not a User |
| Application rejected | Applicant | None | — | — | Silent; no rejection reason |
| Application admitted/account created | New Student | Background email + log | `Your student account is ready`; role, temporary password, login URL | `APPLICATION_STATUS_CHANGED` | Plaintext weak temporary password; no durable invite/forced reset |
| Admin creates staff/student account | Created user | Background email + log | Same welcome template | `APPLICATION_STATUS_CHANGED` | Same password/invite concern |
| Supervisor assigned | Supervisor | Email + log | `New supervisor assignment: <role>`; student, assigner | `APPLICATION_STATUS_CHANGED` | No student/in-app; wrong event; no promotion/removal message |
| Proposal status changed | Student | Email + in-app + log | `Proposal status updated: <status>`; title, optional feedback | `PROPOSAL_STATUS_CHANGED` | Feedback not persisted as decision record |
| Proposal Examiner submits review | Active Administrators | Email + in-app + log | `Proposal review received: <title>`; examiner, student, feedback | Email log `PROPOSAL_STATUS_CHANGED`; in-app `EXAMINER_REVIEW_SUBMITTED` | Inconsistent taxonomy; no admin UI |
| Ethics package submitted | Active Administrators | Email + in-app + log | `Ethics approval submitted: <title>`; student, title | `ETHICS_APPROVAL_SUBMITTED` | Wording implies decision workflow that does not exist |
| Progress report submitted | All active assigned Supervisors | Background email + in-app + log | `Progress report submitted for <period>`; student, period | `PROGRESS_REPORT_SUBMITTED` | No deep link; notification can precede failed file upload |
| Progress review assigned | Examiner | None | — | `EXAMINER_REVIEW_ASSIGNED` defined but unused | Missing |
| Progress review submitted | Administrator | None | — | `EXAMINER_REVIEW_SUBMITTED` exists but this flow does not call it | Missing |
| Progress review released | Student/Supervisor | None | — | `ADMIN_REVIEW_RELEASED` defined but unused | Missing and no release UI |
| Thesis submitted | Active Administrators | Email + log | `New thesis submission: <title>`; student, programme, title | `APPLICATION_STATUS_CHANGED` | No in-app; wrong event; can precede failed upload |
| Thesis submitted | Active assigned Supervisors | Email + log | Progress-report template with synthetic “period” | `PROGRESS_REPORT_SUBMITTED` | Wrong template/event; no in-app |
| Thesis Examiner assigned | Examiner | Email + log | `New thesis examiner assignment: <title>`; student, assigner, 15-minute URL | `APPLICATION_STATUS_CHANGED` | Wrong event; one first file only; link likely expires before use; no in-app |
| Thesis review submitted | Administrator | None | — | — | Missing |
| Thesis review released | Student | None | — | — | Missing and no retrieval path |
| Viva scheduled/rescheduled | Student and assigned Examiners | Email + in-app + log | `Viva scheduled for thesis: <title>`; server-formatted date/time and venue | `VIVA_SCHEDULED` | No timezone label/deep link; Examiner card omits time |
| Viva outcome recorded | Student/Admin/Supervisors/other Examiners | None | — | — | Critical lifecycle transition is silent |
| Viva requires corrections | Student | None | — | `CORRECTIONS_REQUIRED` defined but not used here | Student is not told requirements |
| Student submits correction package | Active Administrators | Email + in-app + log | `Correction document submitted: <title>`; student, chosen type | `CORRECTIONS_REQUIRED` | Event describes requirement, but trigger is submission |
| Correction approved | Student | None | — | — | Silent; thesis state unchanged |
| Thesis finalized/archived | Student | Background email + in-app + log | `Your thesis has been archived: <title>`; completion message | `THESIS_ARCHIVED` | Generic status endpoint sends nothing; background reliability |
| Registration exactly 14 days from expiry | Student | Email + in-app + log | `Registration expiry reminder: 14 days remaining`; date, renewal warning | `REGISTRATION_EXPIRY_APPROACHING` | No dedup; depends on scheduler/exact day |
| Registration lapses | Student/Admin | None | — | — | Silent |
| Registration renewed | Student/Admin | None | — | — | Silent |
| Examiner current-thesis download through one endpoint | Notification log only | Audit row | `Thesis download accessed: <id>` | `THESIS_DOWNLOADED` | Other download paths are not audited; not a user notification |

### 10.3 Defined event catalogue and actual use

The schema defines 15 events (`prisma/schema.prisma:76-92`). Five are effectively dead in the current workflow: `ETHICS_APPROVAL_STATUS_CHANGED`, `PROGRESS_REPORT_SIGNED_OFF`, `SUPERVISOR_SUBMISSION_AVAILABLE`, `EXAMINER_REVIEW_ASSIGNED`, and `ADMIN_REVIEW_RELEASED`. `THESIS_DOWNLOADED` is an audit marker, not a notification. Several active emails reuse unrelated events, making KPI/filter/audit interpretation unreliable.

### 10.4 Template security and content quality

Email HTML templates interpolate names, titles, research areas, feedback, venues, and similar values directly into HTML strings without escaping—for example proposal feedback at `src/lib/email.ts:166-191`. A malicious stored value can alter email markup or create deceptive links/content. Use a shared HTML-escape helper or a templating system with escaping enabled.

The viva date uses server `toLocaleString()` without an explicit timezone/locale (`src/lib/email.ts:614-639`). Store UTC, render the configured institutional timezone, and include the timezone abbreviation in email and UI.

## 11. Administrator features, reports, and maintenance

### 11.1 Currently exposed administrator functions

| Function | Current behavior | Principal limitation |
|---|---|---|
| User management | Create role account and profile; filter; deactivate | No edit/reactivate/reset/search/pagination; unsafe password invite; no last-admin/self guard visible |
| Application management | List submitted, inspect, download, change status, admit/reject | Under-review queue missing; no owner, notes, reason, or history |
| Proposal decisions | List and set approved/rejected with optional feedback | Decision screen lacks proposal evidence and examiner reviews |
| Ethics evidence | List and download | No decision by current design |
| Supervisor assignment | List/create/remove/promote | No history/date/reason; race-prone limits |
| Examiner assignment | Assign active Examiner, email first file | No remove/reassign/count policy, review queue, or in-app item |
| Viva | Schedule/reschedule | No prerequisites beyond thesis status/future date |
| Corrections/finalization | Approve correction, archive/graduate | No download in decision screen, rejection/notes/confirmation, or atomic registration closure |
| Document administration | Search and soft delete | No retention schedule, restore, legal-hold, or parent-integrity view |
| Notification delivery audit | Filter/paginate/export current page | No retry/resend, full filtered export, delivery latency, or alerting |

### 11.2 Backend reports not exposed in the dashboard

| API | Information available | Current UI status |
|---|---|---|
| `/api/admin/reports/students` | Student/programme/status/registration overview and CSV-capable response | Backend-only |
| `/api/admin/reports/graduations` | Graduated student/thesis information | Backend-only |
| `/api/admin/reports/thesis-pipeline` | Thesis states and pipeline data | Backend-only |
| `/api/admin/reports/overdue-progress` | Reports marked overdue | Backend-only; underlying overdue definition is flawed |
| `/api/admin/students/under-review` | Student under-review list | KPI exists, no drill-down |
| `/api/admin/archived` | Archived records | No browser/restore UI; thesis archive flag inconsistency limits results |

Recommended dashboard work should begin by correcting metric definitions, then add evidence-backed queues and drill-downs rather than decorative charts.

### 11.3 Maintenance jobs

The single maintenance endpoint performs both registration maintenance and overdue progress marking. It is not connected to a committed scheduler. The endpoint should be split into idempotent jobs, use mandatory secret/signature authentication, accept only POST, record run/lease state, deduplicate reminders, expose health metrics, and define retry behavior.

## 12. API route catalogue

The following catalogue records the actual route-handler surface at the baseline. Service-level ownership/conflict checks still apply after the role wrapper. “Retired” means the route exists but the service returns `410 Gone`.

### 12.1 Public, authentication, dashboard, and maintenance APIs

| Route | Method | Access | Purpose/status |
|---|---|---|---|
| `/api/applications` | POST | Public | Submit public application |
| `/api/applications/upload-url` | POST | Public | Create signed draft upload URL |
| `/api/applications/upload` | POST, DELETE | Public | Server upload or delete draft evidence |
| `/api/auth/session` | POST, PATCH, DELETE | Public/session | Create, refresh activity, or clear session cookies |
| `/api/auth/me` | GET | All authenticated roles | Current authenticated context |
| `/api/auth/claims` | POST | **Public (defect)** | Sets Firebase claim and local role; critical vulnerability |
| `/api/dashboard/[role]/summary` | GET | All authenticated roles; requested role checked | Role KPI/action summary |
| `/api/notifications` | GET, PATCH | All authenticated roles | Recent notifications; mark all read |
| `/api/cron/check-registrations` | GET | Secret only if configured; otherwise public | Registration reminders/lapse and overdue marking |
| `/api/test/rbac` | GET | Administrator | Test endpoint present in application route tree; remove/disable for production |

> **WP-01 working-tree route delta — not deployed.** `/api/auth/claims` and its Firebase claim-sync helper have been removed. `/api/cron/check-registrations` now exports POST only, fails closed unless a sufficiently strong secret is configured, verifies a timestamped HMAC and UTC daily run key, and claims a unique database maintenance-run record before work begins. The baseline rows above remain unchanged until deployment verification.

### 12.2 Application and user administration APIs

| Route | Method | Access | Purpose/status |
|---|---|---|---|
| `/api/applications` | GET | Administrator | List applications, status filter supported |
| `/api/applications/[id]` | GET | Administrator | Application detail |
| `/api/applications/[id]/status` | PATCH | Administrator | State transition/admission provisioning |
| `/api/applications/[id]/documents/[docId]/download` | GET | Administrator | Signed evidence download |
| `/api/admin/users` | GET, POST | Administrator | List/create role accounts |
| `/api/admin/users/[id]/deactivate` | PATCH | Administrator | Deactivate user and linked Firebase account behavior |
| `/api/students/[id]` | GET, PATCH | Student/Supervisor/Administrator with service scope | Student profile view/update |
| `/api/students/[id]/progress` | GET | Student owner | Lifecycle progress projection |
| `/api/students/[id]/archive` | PATCH | Administrator | Administrative record archive |
| `/api/registrations/[id]/renew` | POST | Student owner or Administrator | Immediate registration renewal |

### 12.3 Assignment, proposal, and ethics APIs

| Route | Method | Access | Purpose/status |
|---|---|---|---|
| `/api/assignments/supervisors` | GET, POST | Administrator | List/create assignment |
| `/api/assignments/supervisors/[id]` | PATCH, DELETE | Administrator | Promote/update or remove assignment |
| `/api/proposals` | GET, POST | Student | Own proposal view/submission/revision |
| `/api/proposals/upload-url` | POST | Student | Proposal signed upload URL |
| `/api/proposals/[id]/status` | PATCH | Administrator | Proposal decision |
| `/api/proposals/[id]/versions` | GET | Student/Supervisor/Administrator; Examiner wrapper admitted but service denies | Version list; fails for valid multi-file current version |
| `/api/proposals/[id]/versions/[v]/download` | GET | Same service scope | Signed version download |
| `/api/proposals/[id]/versions/[v]` | — | None | Empty/inert route file; remove or implement |
| `/api/proposals/[id]/evaluations` | GET | Examiner/Administrator | Evaluation list; Examiner access is not assignment-based |
| `/api/proposals/[id]/evaluations` | POST | Examiner | Submit one evaluation without assignment |
| `/api/ethics` | GET, POST | Student | Own ethics package view/submission |
| `/api/ethics/upload-url` | POST | Student | Ethics signed upload URL |
| `/api/admin/ethics` | GET | Administrator | List packages |
| `/api/admin/ethics/[id]/decision` | PATCH | Administrator | **Retired; always `410`** |

### 12.4 Progress-report APIs

| Route | Method | Access | Purpose/status |
|---|---|---|---|
| `/api/student/progress-reports` | GET, POST | Student | Own report history/submission |
| `/api/supervisor/progress-reports` | GET | Supervisor | Assigned-student monitoring |
| `/api/progress-reports/[id]/sign-off` | PATCH | Supervisor | **Retired; always `410`** |
| `/api/supervisor/progress-reports/[id]/sign` | POST | Supervisor/Administrator wrapper | **Retired; always `410`** |
| `/api/review-panels` | POST | Administrator | **Retired; always `410`** |
| `/api/review-panels/[id]` | GET | Administrator/Supervisor | **Retired; always `410`** |
| `/api/progress-reports/[id]/panel-evaluation` | POST | Supervisor | **Retired; always `410`** |
| `/api/progress-reports/[id]/reviews` | POST | Administrator | Assign Examiner review; backend-only |
| `/api/progress-report-reviews/[id]` | POST | Assigned Examiner | Submit review; backend-only |
| `/api/progress-report-reviews/[id]` | PATCH | Administrator | Comment/release review; backend-only |

### 12.5 Thesis, viva, correction, and document APIs

| Route | Method | Access | Purpose/status |
|---|---|---|---|
| `/api/theses` | POST | Student | Submit/revise thesis |
| `/api/theses/[id]/status` | PATCH | Administrator | Generic thesis transition |
| `/api/theses/[id]/versions` | GET | Student/Examiner/Administrator; Supervisor wrapper admitted but service denies | Version list; multi-file defect |
| `/api/theses/[id]/versions/[v]/download` | GET | Same service scope | Version download |
| `/api/theses/[id]/download` | GET | Assigned Examiner | Current download and limited audit |
| `/api/assignments/examiners` | POST | Administrator | Assign thesis Examiner |
| `/api/thesis-examiner-assignments/[id]/review` | POST | Assigned Examiner | Submit thesis review; backend-only |
| `/api/thesis-examiner-assignments/[id]/review` | PATCH | Administrator | Comment/release review; backend-only |
| `/api/vivas` | POST | Administrator | Schedule/reschedule viva |
| `/api/vivas/[id]` | GET | Administrator/assigned Examiner | Viva detail |
| `/api/vivas/[id]/outcome` | POST | Assigned Examiner | Record shared outcome |
| `/api/theses/[id]/corrections` | GET | Administrator | List correction packages |
| `/api/theses/[id]/corrections` | POST | Student owner | Submit correction package |
| `/api/theses/[id]/corrections/[cid]/approve` | PATCH | Administrator | Approve package |
| `/api/theses/[id]/archive` | PATCH | Administrator | Finalize/archive and graduate |
| `/api/documents` | GET | All authenticated roles with service scope | Search repository |
| `/api/documents/[id]` | GET | All authenticated roles with service scope | Signed download |
| `/api/documents/[id]` | PATCH | Administrator | Soft delete |

### 12.6 Administrator report/audit APIs

| Route | Method | Access | Purpose/status |
|---|---|---|---|
| `/api/admin/proposals` | GET | Administrator | Proposal decision list |
| `/api/admin/notification-log` | GET | Administrator | Email/audit delivery log |
| `/api/admin/reports/students` | GET | Administrator | Student report; backend-only |
| `/api/admin/reports/graduations` | GET | Administrator | Graduation report; backend-only |
| `/api/admin/reports/thesis-pipeline` | GET | Administrator | Thesis pipeline report; backend-only |
| `/api/admin/reports/overdue-progress` | GET | Administrator | Overdue report; backend-only |
| `/api/admin/students/under-review` | GET | Administrator | Under-review list; no UI drill-down |
| `/api/admin/archived` | GET | Administrator | Archived-record list; no UI |

## 13. Testing, quality, security, and operational readiness

### 13.1 What the current tests establish

- Core validation, state-map helpers, role wrappers, notification dispatch, service branches, and UI components have meaningful automated coverage.
- The full Vitest suite passed at the baseline: 79 files and 243 tests.
- The production compiler/build passed, so imports, types used by the build, and page generation are internally consistent at the audited snapshot.
- Retired routes have tests that intentionally expect `410`, confirming retirement is deliberate rather than accidental.

### 13.2 What the tests do not establish

- Most integration-labelled tests mock Prisma, Supabase, Firebase, SMTP, and signed URLs.
- No test proves a real browser can complete the entire lifecycle against disposable external services.
- No standard script runs the four Playwright specs; no `playwright.config.*` was found.
- No test covers concurrent supervisor assignment/registration renewal invariants with a real database.
- No end-to-end test verifies multi-file version downloads, upload-finalize failures, review confidentiality before/after release, repeated viva cycles, cron deduplication, or graduation/registration consistency.
- No coverage threshold, mutation testing, migration smoke test, accessibility automation, performance/load test, or dependency gate is configured.

### 13.3 Security posture summary

Positive controls include runtime Zod validation in many routes/services, Prisma query APIs rather than string SQL, sanitized storage filenames/roots, protected object-store roots, short-lived signed download URLs, secure/HttpOnly/SameSite cookies, active-user checks, role/resource scoping, no raw React HTML sinks found, and ignored environment files.

Material weaknesses include the public claims endpoint, claim/database drift, review attachment leakage, missing CSRF/origin defenses, fail-open cron auth, public upload abuse surface, client-declared file metadata without content inspection, unescaped email HTML, missing application security headers, public source-map risk, incomplete session invalidation, and vulnerable dependencies. Detailed evidence and remedies are in the final risk register.

### 13.4 Dependency audit snapshot

`npm audit --omit=dev --json` on 18 July 2026 reported:

| Severity | Count |
|---|---:|
| Critical | 1 |
| High | 11 |
| Moderate | 26 |
| Low | 2 |
| **Total** | **40** |

Direct affected packages included `next`, `nodemailer`, `firebase`, `firebase-admin`, `@sentry/nextjs`, `postcss`, and the installed Playwright package. The count includes transitive dependencies and does not prove each advisory is reachable through PGLMS, but it requires a controlled upgrade and reachability/regression review before production use.

### 13.5 Production-readiness checklist

| Control | Baseline state |
|---|---|
| Production build | Passed locally |
| CI build/test gate | WP-02 source implemented; first hosted run and branch protection pending |
| Deployment manifest | Missing |
| Environment template/validation | Placeholder template and test-database guard implemented; deployment validation pending |
| Database migration pipeline | Empty-database CI and destructive-migration policy implemented; populated-data rehearsal/deployment pending |
| Live integration/E2E | Public browser/accessibility and real PostgreSQL smoke added; Firebase/Supabase/SMTP/authenticated E2E pending |
| Scheduler definition/health | Missing |
| Email retry/outbox | Missing |
| Security headers | Not visible; verify edge |
| Rate limiting/WAF | Not visible; verify edge |
| Malware/content scanning | Missing |
| Audit trail for domain decisions | Missing |
| Backup/restore evidence | Not visible |
| Retention/privacy policy | Not visible |
| Monitoring/alerts | Sentry code present; operational verification required |
| Accessibility browser audit | Not performed |

## 14. Source map for future developers

| Concern | Primary files/directories |
|---|---|
| Schema/state | `prisma/schema.prisma`, `prisma/migrations`, `src/lib/prisma/*-status.ts` |
| Authentication/RBAC | `src/lib/firebase/admin.ts`, `auth.ts`, `with-auth.ts`, `authorization.ts`; `src/app/api/auth` |
| Applications/admission | `src/lib/applications`, `src/app/api/applications`, `src/components/application`, admin application components |
| Registration | `src/lib/registrations.ts`, renewal route, cron route |
| Supervisor/examiner assignments | `src/lib/assignments`, assignment routes/components |
| Proposal | `src/lib/proposals`, proposal routes/components |
| Ethics | `src/lib/ethics`, ethics routes/components |
| Progress reports/reviews | `src/lib/progress-reports`, `src/lib/review-panels`, corresponding routes/components |
| Thesis/reviews/corrections | `src/lib/theses`, thesis routes/components |
| Viva | `src/lib/vivas.ts`, `src/app/api/vivas`, viva components |
| Documents/storage | `src/lib/documents.ts`, `src/lib/storage.ts`, document routes/repository component |
| Notification/email | `src/lib/notifications.ts`, `src/lib/email.ts`, notification routes/components/admin log |
| Dashboards | `src/lib/dashboard/summary.ts`, `src/components/dashboard`, role page trees |
| Reports/archive | `src/lib/admin/system-reports.ts`, `archive.ts`, report routes |
| Tests | `tests/unit`, `tests/integration`, `tests/e2e` |

## 15. Living progress register

### 15.1 Change log

| Version | Date | Baseline/change | Author/owner | Verification |
|---|---|---|---|---|
| 1.0 | 18 Jul 2026 | Initial full repository audit and implementation baseline | Codex audit; project owner to confirm | Full Vitest and production build passed; source audits completed |
| 1.1 | 18 Jul 2026 | Added dependency-ordered remediation plan, corrected change-to-risk ownership, recorded CERPS policy-alignment evidence, and scheduled shared UI templates after lifecycle approval | Codex planning; project owner to approve | All RISK-001–034 mapped exactly once; official University/CERPS sources checked; Markdown consistency checks passed |
| 1.2 | 18 Jul 2026 | Implemented the WP-01 local hotfix: removed public claims mutation, added release/parent-aware review-document authorization, hardened maintenance execution, and added a temporary one-file submission guard | Codex implementation; project owner/deployer pending | Focused 10 files / 49 tests, full 82 files / 264 tests, Prisma validation, and production build passed locally; deployment and reconciliation remain pending |
| 1.3 | 25 Jul 2026 | Implemented WP-02 dependency stabilization and repository quality gates: supported Next/React/runtime baseline, strict lint/type checks, CI/CodeQL/Dependabot, guarded migrations/database tests, public browser/accessibility smoke, and placeholder environment contract | Codex implementation; project owner/repository administrator/deployer pending | Clean install; audits with zero high/critical; lint/type; 81/263 ordinary tests plus one disposable-PostgreSQL test; four migrations/drift check; build; and 2/2 browser smokes passed locally |

### 15.2 Remediation work-package register

This register is the working index. `CHG-001` through `CHG-015` correspond one-to-one with `WP-01` through `WP-15` in Section 17. Keep detailed acceptance evidence in the linked issue/PR and update the corresponding capability/risk rows only when verified.

| Change ID | Related risks/capabilities | Proposed outcome | Priority | Status | Owner | Acceptance evidence |
|---|---|---|---|---|---|---|
| CHG-001 | RISK-001/002/006 | Emergency privilege, confidential-review, and scheduler containment | P0 | Implemented (committed; deployment pending) | Codex (code); project owner/deployer pending | Commit `9949fb8`; focused 10/49, full 82/264, Prisma validation, and build pass. Remaining: migration, scheduler cutover, reconciliation, and deployed exploit-path smoke evidence |
| CHG-002 | RISK-010/029, CAP-029 | CI safety net and supported dependency baseline | P1 enabler | Implemented (local; hosted enforcement pending) | Codex (code/docs); repository administrator/deployer pending | Clean install; zero high/critical audit; lint/type; 81/263 ordinary tests plus one real-DB test; empty migration/drift; build; 2/2 browser smokes. Remaining: protected checks, first hosted run, populated-data rehearsal, external-service E2E, and deployment evidence |
| CHG-003 | RISK-004/005/008/009/017 | Identity, session, CSRF, email, headers, and onboarding hardening | P1 | Proposed | Unassigned | Role mismatch/session/CSRF/header/email/invitation security suite passes |
| CHG-004 | RISK-003/007/015/026, CAP-001/006/009/013/018/021 | Logical multi-file versions, central document policy, and staged uploads | P0/P1 | Proposed | Unassigned | 1–10 file logical versions, uniform ACL, verified finalize/retry, scan, and migration checks pass |
| CHG-005 | RISK-016/020, CAP-022/023/026 | Append-only lifecycle audit and transactional outbox | P1 | Proposed | Unassigned | Atomic transition/outbox, immutability, retry, deduplication, and recovery tests pass |
| CHG-006 | RISK-034, CAP-030 | Approved CERPS programme, lifecycle, role, and terminology baseline | Policy gate | Proposed | Unassigned | Department/Faculty owner signs dated scope, state diagrams, RACI, glossary, and deviations |
| CHG-007 | RISK-012/013, CAP-008/009/010/011 | Conditional ethics and six-month/yearly progress obligations with FHDC panel review | P1 | Proposed | Unassigned | Approved ethics applicability/gates and CERPS-aligned progress-cycle/panel E2E pass |
| CHG-008 | RISK-011/025, CAP-007/012/015 | Explicit, version-bound proposal/progress/thesis review assignments and release | P1 | Proposed | Unassigned | Assigned Examiner → admin release → candidate full browser E2E passes for all review types |
| CHG-009 | RISK-014/027, CAP-017/018 | Board-governed viva, ratified outcomes, and ordered corrections | P1 | Proposed | Unassigned | Board composition/quorum/notice, recommendations, decision, correction, and certification E2E pass |
| CHG-010 | RISK-018/019, CAP-004/019/020 | Governed renewal plus atomic completion, graduation, archive, and access closure | P1 | Proposed | Unassigned | One-active-registration invariant and failure-injected atomic finalization tests pass |
| CHG-011 | RISK-021/028, CAP-001/006/018 | Evidence-first admin decisions and secure applicant tracking | P2 | Proposed | Unassigned | Work remains discoverable; evidence/reason required; applicant status/notice E2E passes |
| CHG-012 | RISK-024/033, CAP-023/024/025 | Accurate notification center and safe operational reports/exports | P2/P3 | Proposed | Unassigned | Unread/deep-link/retry tests and complete authorized filtered export checks pass |
| CHG-013 | RISK-022/023/031, CAP-024/025/030 | Shared UI templates, corrected KPIs/navigation/identity, and accessibility | P2 | Proposed | Unassigned | Template contract, link crawl, visual regression, and WCAG 2.2 AA evidence pass |
| CHG-014 | RISK-030, CAP-027/028/029 | Monitoring, backup/restore, privacy/retention, and incident readiness | Release gate | Proposed | Unassigned | Scheduler/dead-letter alerts and isolated restore drill meet approved RPO/RTO |
| CHG-015 | RISK-032 | Retired route/model cleanup and generated documentation normalization | P3 last | Proposed | Unassigned | No inert/test/duplicate/active-410 workflow surface; clean/current DB migrations pass |

#### WP-01 implementation checkpoint — local, not deployed

Implemented changes:

- Removed `/api/auth/claims`, its Firebase claim-sync helper, and the obsolete request schema/test surface. Legitimate account/claim provisioning remains in controlled admission and Administrator user-management workflows.
- Centralized review-attachment authorization in the repository query itself. Student/Supervisor access now requires exactly one recognized review parent, a released parent review, and candidate ownership derived through that parent; standard repository documents must have no review parent. Administrator reconciliation access remains available.
- Replaced state-changing maintenance GET with signed POST. The handler requires a configured secret of at least 32 bytes, a fresh timestamp, a valid HMAC, and a signed run key equal to the timestamp's UTC date. An additive `MaintenanceRun`/`MaintenanceRunStatus` migration supplies a unique `(jobName, runKey)` ledger and completed/failed result state.
- Added a temporary one-file proposal/thesis rule at both schema and UI boundaries. Requests containing more than one file—or both legacy singular and array fields—are rejected, and form fields cannot change while submission is in flight.
- Added regression coverage for removed route surface, scheduler authentication/replay, release-aware document access, nested ownership, one-file validation, and in-flight UI locking.

Required rollout and reconciliation before CHG-001 can be `Verified`:

1. Block the old claims and maintenance behavior at the deployment edge during rollout; never roll back to a public role-mutation route or fail-open GET.
2. Apply `20260718120000_add_maintenance_run_idempotency` before deploying the new route, then configure the external scheduler to send the documented signed POST headers with a strong managed secret and perform success/failure/replay smoke tests.
3. Reconcile Firebase UIDs/custom claims against active local users and roles; investigate unexpected changes, repair them, and revoke affected sessions/tokens.
4. Reconcile existing `Document` rows for zero/multiple review parents, mismatched type/parent, and candidate-ID disagreement. The code now fails such rows closed for Student/Supervisor access, but the database schema does not yet enforce the invariant.
5. Audit existing proposal/thesis data for multiple current documents and preserve affected evidence before WP-04 migration.
6. Verify anonymous, Student, Supervisor, Examiner, and Administrator access in a deployed environment using real Firebase, database, storage, mail, and scheduler configuration.

Known residuals and ownership:

- The maintenance ledger prevents an ordinary duplicate daily run, but it cannot make individual notifications/emails exactly-once across a partial crash. A failed run also cannot safely resume under the same daily key. Per-effect/outbox idempotency belongs to WP-05; scheduler monitoring and recovery drills belong to WP-14.
- Two concurrent or replayed valid one-file proposal/thesis requests can still create competing current documents because the database lacks the final logical-version/current-version invariant. The temporary guard prevents one request from containing several files; RISK-003 remains open for WP-04.
- The former standalone TypeScript failures are resolved by WP-02's Next.js route-type migration and explicit `next typegen && tsc --noEmit --incremental false` gate.

| Risk | Local disposition | Closure condition |
|---|---|---|
| RISK-001 | Code fix implemented; risk open | Deploy route removal, reconcile identities/roles, revoke compromised sessions, and pass deployed exploit-path tests |
| RISK-002 | Code fix implemented; risk open | Deploy, reconcile malformed review documents, and verify role/release access against production-like data |
| RISK-006 | Code fix implemented; risk open | Apply migration, cut scheduler to signed POST, verify fail-closed/replay behavior, and establish recovery monitoring |
| RISK-003 | Temporary mitigation implemented; risk open | Complete WP-04 logical-version, uniqueness, concurrency, and data-migration acceptance |

#### WP-02 implementation checkpoint — local, hosted enforcement pending

Implemented changes:

- Upgraded the application to Node.js 24, Next.js 16, React 19, current Firebase/Firebase Admin, Nodemailer, Sentry, Playwright, Vitest, ESLint, and related supported tooling; migrated Next.js request APIs, route handler types, Sentry instrumentation, and ESLint flat configuration.
- Added reproducible runtime/package metadata, a placeholder-only `.env.example`, clean strict lint/type scripts, separate unit/integration/database/browser/external-browser commands, and production/all-dependency audit gates.
- Added GitHub Actions for quality, disposable PostgreSQL migrations/drift, public Chromium/accessibility smoke, verified-secret scanning, and CodeQL, plus weekly Dependabot updates. Actions are pinned to immutable commit SHAs.
- Added a checksum-enforced migration policy. The inherited destructive July migration is permitted only for empty-database validation and remains explicitly blocked for populated production data.
- Guarded the real database integration test so it requires `TEST_DATABASE_URL`, a `test`/`ci` database name, and explicit opt-in for a remote host.
- Added the operating and rollout procedure in `docs/operations/CI_AND_MIGRATION_GATES.md`.

Local verification on 25 July 2026:

| Gate | Result |
|---|---|
| Clean dependency install | Passed with `npm ci --no-audit --no-fund` |
| Dependency audits | Passed at high threshold; 0 critical/high, 9 documented moderate findings (6 production, 3 development-only) |
| Static checks | Strict ESLint and explicit Next.js/TypeScript type checking passed |
| Ordinary automated tests | 81 files / 263 tests passed; the guarded database test was skipped without `TEST_DATABASE_URL` |
| Disposable PostgreSQL | All four migrations applied; status current; zero schema drift; real database test 1/1 passed |
| Migration policy | Passed with one known checksum-pinned production blocker covering 21 destructive statements |
| Production build | Next.js 16.2.11 build passed; 67 static-page-generation units completed |
| Browser/accessibility | 2/2 Chromium smokes passed against the production server; no serious/critical axe finding on the public application page |
| Workflow structure | CI, CodeQL, and Dependabot YAML parsed successfully |

Required evidence before CHG-002 can be `Verified`:

1. Require `CI / Quality`, `CI / Database migrations`, `CI / Browser smoke`, `CI / Secret scan`, and `CodeQL / Analyze JavaScript and TypeScript` on the protected `main` branch and record a green first hosted run.
2. Enable and record GitHub secret scanning, push protection, Dependabot alerts, and security updates.
3. Rework or formally approve the blocked destructive migration only after a sanitized populated-data rehearsal, preservation checks, backup/restore timing, and named approval.
4. Add isolated Firebase, Supabase, SMTP, and authenticated role E2E environments; the default smoke set deliberately excludes tests tagged `@external`.
5. Record deployment, runtime smoke, and rollback/recovery evidence. WP-02 does not supply a deployment platform or close the WP-14 backup/monitoring work.

| Risk | Local disposition | Closure condition |
|---|---|---|
| RISK-010 | Major code/dependency remediation implemented; risk reduced, not closed | Hosted audits remain required; review the nine moderate residuals by 25 Aug 2026 or on upstream release; demonstrate deployed compatibility |
| RISK-029 | Repository CI/database/browser/security gates implemented; risk reduced, not closed | Required branch protection and first hosted checks pass; populated-data rehearsal, external-service E2E, and deployment evidence are recorded |

### 15.3 Update procedure

For every accepted change:

1. Record the issue/decision and assign an owner.
2. Update the relevant workflow “Current sequence” only after implementation.
3. Change Capability status only after end-to-end verification.
4. Update the risk status to Mitigated/Accepted/Deferred and cite evidence.
5. Add a change-log row with commit/PR, migration notes, tests, and deployment verification.
6. Keep this Markdown current after each fix. Regenerate and visually verify the DOCX at the agreed cadence—by default after the remediation programme, or earlier only on request.

## 16. Current flaws, risks, and recommended solutions

This is the final and authoritative risk section for the baseline. Priorities are: **P0** immediate stop-ship; **P1** required before production or the affected lifecycle is relied upon; **P2** important correctness/operability work; **P3** planned quality improvement.

### 16.1 Priority summary

| Priority | Risks | Release interpretation |
|---|---|---|
| P0 | RISK-001 to RISK-003 | Do not expose the current build to untrusted users or rely on multi-file review workflows until corrected. |
| P1 | RISK-004 to RISK-019 | Required to make lifecycle decisions reliable, secure, and supportable. |
| P2 | RISK-020 to RISK-031 | Required for maintainability, transparency, accessibility, and coherent operations. |
| P3 | RISK-032 to RISK-034 | Quality/clarity improvements that should follow core corrections. |

### 16.2 Detailed security findings

#### RISK-001 — unauthenticated role-claim assignment

- **Rule ID:** NEXT-AUTH-001 / PGLMS-SEC-001
- **Severity/Priority:** Critical / P0
- **Location:** `src/app/api/auth/claims/route.ts:6-30`; `src/lib/firebase/claims.ts:20-31`
- **Evidence:** The public POST parses `userId`, `firebaseUid`, and any supported role, then calls Firebase Admin to set the custom claim and updates the target local user’s Firebase UID and role. No authentication, Administrator check, target validation, or anti-self-promotion control is called.
- **Impact:** Any network caller can promote an account to Administrator, relink a local user to an attacker-controlled Firebase identity, or alter another role. This compromises all PGLMS data and actions.
- **Fix:** Remove the route if it is a development helper. Otherwise require an already-authenticated Administrator, verify the target identity, restrict allowed transitions, prevent last-admin/self-dangerous changes, revoke target sessions, write an immutable audit record, and require a recent privileged re-authentication.
- **Mitigation:** Block the route at the edge immediately while the code fix is prepared; inspect Firebase claims and local role/link changes for unauthorized activity.
- **False-positive notes:** None visible in repository. Protection at an external gateway could reduce reachability but does not make the application safe; verify deployed routing urgently.
- **WP-01 remediation status (18 Jul 2026):** The route/helper/schema surface is removed in the locally verified working tree and a source-level regression test prevents accidental restoration. **Open** pending deployment, Firebase/local identity-role reconciliation, session/token revocation where required, and deployed anonymous/self-promotion tests.

#### RISK-002 — unreleased examiner attachments exposed to students/supervisors

- **Rule ID:** NEXT-AUTH-001 / PGLMS-SEC-002
- **Severity/Priority:** High / P0
- **Location:** `src/lib/documents.ts:63-71,94-236,816-834`; `src/lib/proposals/evaluations.ts:357-372`; `src/lib/progress-reports/reviews.ts:343-357`; `src/lib/theses/reviews.ts:193-207`
- **Evidence:** Review documents are `REVIEW_ATTACHMENT` rows with the candidate’s `studentId`. The repository includes that document type and grants Student/Supervisor access based on direct student ID or assigned-student scope. It never checks the parent review’s `releasedAt`.
- **Impact:** Confidential examiner feedback/evidence may be downloaded before administrative release, undermining examination integrity and privacy.
- **Fix:** Introduce explicit review-document parent relations and release-aware authorization. Do not grant access merely from `studentId`; expose attachments only through a review endpoint that checks actor, assignment, and release. Backfill and test existing rows.
- **Mitigation:** Temporarily exclude `REVIEW_ATTACHMENT` from Student/Supervisor repository queries and direct downloads.
- **False-positive notes:** Text feedback may remain hidden elsewhere, but the attachment metadata/download path is demonstrably release-blind.
- **WP-01 remediation status (18 Jul 2026):** Locally verified repository/download queries now require one recognized released review parent and derive Student/Supervisor ownership through that parent; standard document access excludes all review-linked rows. **Open** pending deployment, malformed-row reconciliation, and production-like role/release verification. Schema-level parent/candidate consistency remains future document-foundation work.

#### RISK-003 — valid multi-file submissions break current/version downloads

- **Rule ID:** PGLMS-INTEGRITY-001
- **Severity/Priority:** High / P0
- **Location:** proposal create `src/lib/proposals/submission.ts:375-384,417-446` versus invariant `src/lib/proposals/versions.ts:111-123`; thesis create `src/lib/theses/submission.ts:439-546` versus invariant `src/lib/theses/versions.ts:106-119`
- **Evidence:** One logical submission accepts up to ten documents and marks every file current. Read services throw `409` unless exactly one current document exists.
- **Impact:** A valid user action makes history and current-download APIs unusable, blocks Examiner/viva evidence access, and makes version selection ambiguous.
- **Fix:** Create `ProposalVersion` and `ThesisVersion` aggregates with one current version per parent and many files per version. Make reviews/assignments point to the logical version. Add a DB uniqueness mechanism and migration for existing rows.
- **Mitigation:** Until redesigned, limit each proposal/thesis version to one file and communicate that restriction; do not silently accept multiple files.
- **False-positive notes:** None; the conflicting invariants are explicit and covered by separate paths.
- **WP-01 remediation status (18 Jul 2026):** The temporary one-file limit is implemented in local server validation and both submission UIs, including rejection of mixed legacy/array payloads and in-flight field changes. **Open** for WP-04: concurrent/replayed one-file requests can still race, and existing multiple-current data still requires reconciliation and a database-backed logical-version invariant.

#### RISK-004 — Firebase claim/database role drift

- **Rule ID:** NEXT-AUTH-001 / PGLMS-SEC-003
- **Severity/Priority:** High / P1
- **Location:** `src/lib/firebase/auth.ts:81-108,132-166`
- **Evidence:** Local lookup selects `id`, `firebaseUid`, `email`, and `isActive`, but not `role`; returned authorization role is solely `decodedToken.role`.
- **Impact:** A stale role claim may preserve privileges after a local role change. Combined with claims synchronization errors, the database and authorization layer can disagree.
- **Fix:** Make one authority explicit—prefer local role for every request or require exact equality and fail closed. Revoke/refresh sessions on role/deactivation changes and audit mismatches.
- **Mitigation:** Run a reconciliation job comparing Firebase claims with local roles and investigate discrepancies.
- **False-positive notes:** Firebase claim revocation may be performed operationally, but equality is still not enforced by this code.

#### RISK-005 — cookie-authenticated mutations lack explicit CSRF/origin validation

- **Rule ID:** NEXT-CSRF-001 / REACT-CSRF-001
- **Severity/Priority:** High / P1
- **Location:** state-changing Route Handlers across `src/app/api`; session cookie options at `src/lib/firebase/admin.ts:136-151`; no CSRF/Origin/Referer checks found by repository scan
- **Evidence:** UI uses cookie-authenticated requests and the server accepts session cookies. Mutation routes rely on `SameSite=Lax` but do not validate a CSRF token or strict request Origin/Referer.
- **Impact:** Cross-site request scenarios, browser/platform changes, subdomain compromise, or unsafe GET behavior can trigger authenticated actions.
- **Fix:** Add a centralized CSRF strategy for cookie-authenticated POST/PUT/PATCH/DELETE APIs, strict Origin/Host validation for JSON endpoints, and tests. Keep SameSite as defense in depth.
- **Mitigation:** Require a non-simple custom header and strict same-origin checks at the edge while introducing tokens.
- **False-positive notes:** An external gateway could add checks; no evidence is present. Bearer-only calls are not CSRF-prone, but these handlers also accept cookies.

#### RISK-006 — fail-open, state-changing cron GET

- **Rule ID:** NEXT-CSRF-001 / NEXT-AUTH-001 / PGLMS-SEC-004
- **Severity/Priority:** High / P1
- **Location:** `src/app/api/cron/check-registrations/route.ts:6-24`
- **Evidence:** Missing `CRON_SECRET` returns authorized, and GET performs database updates and sends notifications.
- **Impact:** An unauthenticated caller can repeatedly lapse records, mark reports overdue, and generate duplicate email/in-app reminders; caches/crawlers may also invoke GET.
- **Fix:** Fail closed if secret/signature configuration is absent, use POST, validate timestamped HMAC or platform job identity, add idempotent run/delivery keys, and rate limit.
- **Mitigation:** Block the route publicly and set a strong secret immediately.
- **False-positive notes:** A private network route could reduce exposure; repository/deployment evidence is absent and fail-open behavior remains unsafe.
- **WP-01 remediation status (18 Jul 2026):** A locally verified POST-only handler now fails closed, validates a fresh HMAC and deterministic UTC daily key, and claims a unique `MaintenanceRun` row. **Open** pending migration/scheduler deployment and runtime smoke evidence. Run-level deduplication does not solve per-email/per-notification partial-failure recovery; that residual belongs to WP-05 and WP-14.

#### RISK-007 — public upload abuse and incomplete file validation

- **Rule ID:** NEXT-FILES-001 / NEXT-DOS-001 / REACT-FILE-001
- **Severity/Priority:** High / P1
- **Location:** public application upload routes; constraints at `src/lib/storage.ts:197-249`; upload `upsert` at `src/lib/storage.ts:303-317`
- **Evidence:** Public callers can request upload capacity without authentication/rate limiting/CAPTCHA. Validation uses claimed MIME and size; no content signature, malware/archive scan, checksum, quarantine, or object-finalize verification is present.
- **Impact:** Storage/SMTP/DB abuse, malicious or mislabeled files, ZIP bombs, orphaned objects, and post-submission overwrite/delete using retained draft identity.
- **Fix:** Add edge/app rate limits and abuse protection; issue server-bound draft tokens; quarantine uploads; validate magic bytes, actual object size/checksum, archive limits, and malware status; lock finalized paths; expire/clean drafts.
- **Mitigation:** Temporarily lower quotas, disable server upload fallback if unnecessary, restrict bucket policy, monitor anomalies, and disallow ZIP until scanning exists.
- **False-positive notes:** Supabase/edge quotas may exist but were not visible; content verification is absent in application code.

#### RISK-008 — unescaped user-controlled values in HTML email

- **Rule ID:** PGLMS-SEC-005 (output encoding)
- **Severity/Priority:** Medium / P1
- **Location:** email template builders, e.g. `src/lib/email.ts:144-214,266-317,614-639`
- **Evidence:** Names, titles, feedback, research area, and venue are interpolated directly into HTML strings.
- **Impact:** Stored values can inject deceptive markup/links or malformed content into trusted institutional emails; some clients may expose additional HTML risks.
- **Fix:** Escape every text value by default or use a templating library with contextual auto-escaping; validate URLs separately; add hostile-input tests.
- **Mitigation:** Strip/control HTML-significant characters from high-risk fields until escaping is centralized.
- **False-positive notes:** Email clients often sanitize scripts, but markup/phishing injection remains possible and should not rely on client behavior.

#### RISK-009 — missing application security headers and possible public source maps

- **Rule ID:** NEXT-HEADERS-001 / NEXT-CSP-001 / REACT-HEADERS-001
- **Severity/Priority:** Medium / P1
- **Location:** `next.config.mjs:4-6`; no header/middleware configuration found
- **Evidence:** No CSP, `X-Content-Type-Options`, clickjacking defense, `Referrer-Policy`, or `Permissions-Policy` is configured in the repository. Production browser source maps are enabled.
- **Impact:** Reduced browser defense-in-depth; possible code/internal-path disclosure and easier exploit development if maps are public.
- **Fix:** Add a tested CSP and baseline headers centrally, verify at runtime, and configure Sentry source-map upload/removal so maps are not publicly served unless explicitly accepted.
- **Mitigation:** Set headers and source-map blocking at the CDN/edge immediately.
- **False-positive notes:** Headers/source-map removal may be supplied by hosting/Sentry; verify actual deployed responses and artifacts before closing.

#### RISK-010 — vulnerable dependency graph

- **Rule ID:** NEXT-SUPPLY-001 / REACT-SUPPLY-001
- **Severity/Priority:** High / P1
- **Location:** `package.json:16-61`, `package-lock.json`; audit snapshot 18 July 2026
- **Evidence:** Production dependency audit reports 40 known findings, including one critical and eleven high. Direct affected packages include framework/auth/email/monitoring dependencies.
- **Impact:** Reachable advisories may permit denial of service, request/header issues, path/URL confusion, or other compromise depending on code path.
- **Fix:** Create an upgrade branch, update Next.js and direct packages to supported patched versions, regenerate lockfile, run full regression/migration/E2E tests, review breaking changes, and configure continuous dependency alerts/audit gates.
- **Mitigation:** Assess advisory reachability, disable unused vulnerable features, apply edge controls, and document time-bounded exceptions.
- **False-positive notes:** Audit totals include transitive packages and possibly unreachable paths; do not dismiss without reachability analysis.
- **WP-02 remediation status (25 Jul 2026):** The local dependency graph now reports zero critical/high findings. Six moderate production findings remain in Firebase Admin's Google Cloud Storage/UUID chain and three development-only moderate findings remain in the `shadcn` MCP/Hono chain; their paths, current reachability assessment, and 25 August review date are recorded in the WP-02 operations guide. **Reduced, not closed** pending hosted audit enforcement, ongoing review, and deployed compatibility evidence.

### 16.3 Lifecycle, data-integrity, UI, and operational risks

| ID | Priority | Current flaw/risk and evidence | Recommended solution | Verification/closure criterion |
|---|---|---|---|---|
| RISK-011 | P1 | Proposal/progress/thesis review services are incomplete: absent assignments or queues, evidence access conflicts, no usable UI, no notifications/release view. | Create version-specific assignments, role queues, evidence access, review forms, admin release, student release view, and notifications. | Full browser E2E for each review type; unauthorized/unreleased access tests pass. |
| RISK-012 | P1 | Ethics is document-only but is named/treated as approval and gates thesis merely on existence. | Product decision: implement formal status/reviewer/decision/revision/expiry/exemption, or rename the capability and remove false approval claims. | Approved state model and acceptance tests; downstream gates use the approved policy. |
| RISK-013 | P1 | Retired supervisor sign-off/review panels remain in schema, routes, labels, docs, and overdue logic; every report ages overdue. | Define reporting cycles/due dates and the authoritative review model; remove retired artifacts and migrate data. | No active `410` links/labels; overdue detects missing/late obligations correctly. |
| RISK-014 | P1 | Viva outcome is one shared Examiner-controlled value with no date guard, quorum, independent recommendations, report, comments, actor audit, or ratification. | Store per-Examiner recommendations and report attachments; require scheduled date, quorum/consensus/chair/admin decision, reason, and audit. | Multi-Examiner E2E proves independent inputs, ratification, transitions, and notices. |
| RISK-015 | P1 | Submission metadata/notifications precede browser storage completion for progress, thesis, and corrections; public/proposal/ethics uploads can orphan objects. | Staged upload session with finalize/abort, object verification, idempotency key, expiry cleanup, and retry/resume. | Simulated failed/partial upload leaves no final record/notice; retry is idempotent. |
| RISK-016 | P1 | Notification coverage/taxonomy is incomplete and misleading; delivery/in-app writes are not atomic; no retry/outbox/dedup/deep links. | Domain-event catalogue plus transactional outbox, worker retries/backoff, idempotency, destination URLs, accurate logs and admin retry tooling. | Trigger matrix is automated; failure/retry/restart tests show exactly-once user-visible intent. |
| RISK-017 | P1 | Temporary passwords use `Math.random()`, are emailed in plaintext, and no forced reset exists. | Firebase password-setup/reset invitation with cryptographic token, expiry, one-time use, and first-login policy; never send reusable password. | No password in email/log; expired/reused invite fails; initial setup flow E2E passes. |
| RISK-018 | P1 | Registration can be renewed immediately/repeatedly; concurrency can create multiple active periods; graduation/archive leaves active renewal/reminders. | Student renewal request + admin approval, eligibility/evidence/payment hooks, idempotency, non-overlap/one-active DB invariant, atomic graduation closure. | Concurrency test produces one active row; graduated/archived renewal/reminder is blocked. |
| RISK-019 | P1 | Finalization/archive is inconsistent across generic status, specialized graduation, Student archive, `Thesis.isArchived`, registration, user/Firebase access. | One atomic lifecycle command and approved state diagram; separate academic finalization, record retention, and account deactivation. | All related states/audit/notifications commit or roll back together; archive list is accurate. |
| RISK-020 | P2 | Status fields overwrite history; assignment deletion removes history; most decisions lack actor/reason/version/time. | Append-only `LifecycleTransition`/decision/audit records and effective-dated assignments. | Every state/assignment/decision change is attributable and queryable; immutability test passes. |
| RISK-021 | P2 | Admin proposal decision is evidence-blind; correction approval lacks file open, reason, rejection, confirmation; application rejection lacks reason. | Evidence-first work queues with document/review panels, required decision notes, confirmation, and audit. | Admin cannot decide without required evidence/notes; UI and audit E2E pass. |
| RISK-022 | P2 | Dashboard KPI definitions are misleading: ethics packages called approvals, historical exams called current/upcoming, correction files called cases, final archive counted as archived, all-time failures called current health. | Define each KPI with owner, SQL/filter, time window, status label, drill-down and test; display last updated. | Product-approved metric dictionary matches API and drill-down dataset. |
| RISK-023 | P2 | Dead/misnamed navigation: hard-coded profile, missing settings, `href="#"`, home-loop quick actions, “evaluate/sign” labels for view-only retired work. | Authenticated identity in shell; remove generic arbitrary-role fallback; correct/disable every route/action; rename based on real responsibility. | Automated link crawl and role E2E find no dead/misleading destinations. |
| RISK-024 | P2 | Notification UI has no real unread badge, authoritative count, refresh, individual read, pagination, deep link, or failure recovery. | Return unread total/action URL; poll or refresh-on-open; individual/bulk read; view-all; admin resend/retry. | >8 unread scenario shows correct count; deep links and retry flows pass. |
| RISK-025 | P2 | Proposal evaluation has no assignment; any non-conflicted Examiner with ID can submit/read all evaluations, while source docs are denied. | Add explicit assignment and least-privilege evaluation access; hide other reviews until permitted; provide version evidence. | Unassigned Examiner receives 403; assigned Examiner sees only permitted evidence/reviews. |
| RISK-026 | P2 | Specialized thesis service denies Supervisor downloads while general repository grants assigned-student thesis access; download audit covers only one path. | Central document authorization policy reused by every download path; product-approved Supervisor policy; unified immutable access audit. | Same authorization result across all paths; every sensitive download creates one audit event. |
| RISK-027 | P2 | Correction type is self-selected and not linked to viva result; resubmitting thesis while corrections required bypasses correction approval; one approved package can ignore pending items. | Create correction requirement/order tied to viva/version with type, instructions, due date, reviewer, disposition; block alternate state bypasses. | State-machine tests enforce required order, matching type, all mandatory items resolved. |
| RISK-028 | P2 | Application under-review items disappear from current admin list; no applicant tracking/reference/notifications. | Admin work queue across Submitted/Under Review with owner/SLA; public opaque reference and secure status channel; decision reasons/notices. | Under-review remains discoverable; applicant receives correct event without exposing internal data. |
| RISK-029 | P2 | **WP-02 reduced:** repository workflows now cover locked install, lint/type/test/build, audits, CodeQL, secret scan, disposable PostgreSQL migrations/drift, a real database test, and public Playwright/accessibility smoke. Hosted protection, deployment automation, populated-data rehearsal, and Firebase/Supabase/SMTP/authenticated E2E remain absent or unverified. | Require the checked-in CI/CodeQL checks on `main`; add isolated external-service E2E and deployment/recovery evidence; keep the destructive migration blocked until populated-data rehearsal is approved. | Protected branch cannot merge/deploy unless all required checks pass; hosted/external/deployment evidence is recorded. |
| RISK-030 | P2 | No scheduler health, backup/restore, retention, privacy/deletion, recovery, or operational runbooks are visible. | Define infrastructure as code, job monitoring, backup/restore drills, retention/legal hold, incident/recovery runbooks, RPO/RTO. | Runtime evidence and successful restore/job-failure drills documented. |
| RISK-031 | P2 | Accessibility gaps: missing live regions/labels/skip link, nested mains, motion, 360px minimum, icon label, mobile drawer uncertainty. | Shared accessible patterns; reduced-motion support; semantic landmarks/labels; browser testing at keyboard, 320px, 400% zoom, contrast. | WCAG 2.2 AA audit findings resolved or explicitly accepted with evidence. |
| RISK-032 | P3 | Empty route file, production test route, retired models/routes, duplicated student progress route, stale documentation create developer confusion. | Remove/quarantine test/empty/retired artifacts after migration; redirect duplicates; keep one generated route/workflow catalogue. | Route inventory contains no inert/stale surface; docs match tests and state model. |
| RISK-033 | P3 | Notification/export/report UX lacks full filtered CSV, trends, latency, ownership, and operational drill-down. | Server-side full export jobs with authorization/audit; actionable health dashboards and saved filters. | Export row count matches filtered dataset; large exports are safe and auditable. |
| RISK-034 | P3 | Programme branding says MPhil/PhD while code accepts MSc/MEng; terminology such as ethics “approval,” archived thesis, and review “sign-off” conflicts with behavior. | Approve a glossary/product scope; align branding, enum labels, routes, help text, emails, and reports. | Terminology review signed off; automated content/route checks prevent regression. |

### 16.4 Recommended implementation order

1. **Immediate containment:** block/remove `/api/auth/claims`; exclude review attachments from candidate/supervisor repository; restrict current production exposure; inventory compromised roles/access.
2. **Integrity foundation:** logical multi-file versions, centralized document permissions, staged upload finalization, authoritative role resolution, CSRF/cron hardening.
3. **Policy decisions:** approve ethics, progress-review, viva governance, correction, renewal, finalization/archive, and terminology state diagrams before further UI work.
4. **Workflow completion:** build Examiner/admin review queues and release views, evidence-first decisions, governed viva/corrections, and consistent graduation/registration closure.
5. **Reliable communications:** domain events, outbox/retry/dedup, accurate templates/taxonomy, complete trigger coverage, action links, and notification UX.
6. **Dashboard/UI correction:** fix identity, links, metrics, accessible patterns, then expose reports and operational queues.
7. **Production controls:** dependency upgrades, CI, live integration/E2E, scheduler/monitoring, security headers, upload scanning, backups/retention/runbooks, and accessibility verification.

The project team should not mark a risk “closed” solely because code was merged. Closure requires the stated verification evidence and an updated capability/workflow baseline in this document.

## 17. Prioritized remediation and modernization plan

**Planning revision:** 1.2, updated 18 July 2026  
**Planning status:** WP-01 and WP-02 authorized/implemented; WP-03–WP-15 remain proposed for project-owner sequencing

**Implementation status:** WP-01 is committed with deployment/reconciliation pending. WP-02 passed local dependency, static, automated, database, migration, build, and browser gates; hosted enforcement, populated-data rehearsal, external-service E2E, and deployment evidence remain pending.
**Canonical tracking rule:** Update this Markdown after each accepted fix. Regenerate the DOCX after the complete programme unless the project owner requests an interim release.

This section converts every current risk in Section 16 into a dependency-ordered work package. The order is intentional:

1. Contain stop-ship security and confidentiality defects.
2. Establish a reliable test/deployment safety net.
3. Repair identity, document, upload, version, audit, and communication foundations.
4. Approve the University/CERPS policy target before rewriting lifecycle rules.
5. Complete the policy-dependent lifecycle workflows.
6. Consolidate the UI only after the domain states and permissions are stable.
7. Prove operational recovery and remove retired surfaces last.

The priority stated here is **execution order**, not a replacement for the risk severity in Section 16. Policy research and design may run in parallel with early engineering, but policy-dependent production code must wait for the approval gate in WP-06.

### 17.1 Ordered work-package list

| Order | Work package | Sole risk ownership | Target outcome | Depends on | Exit gate |
|---:|---|---|---|---|---|
| 1 | **WP-01 — Emergency containment and access-control hotfix** | RISK-001, 002, 006 | Close privilege escalation, premature review disclosure, and fail-open scheduler execution | None | Exploit paths closed in deployed runtime and reconciliation evidence recorded |
| 2 | **WP-02 — CI safety net and dependency stabilization** | RISK-010, 029 | Supported dependency baseline and mandatory test/migration/deployment checks | WP-01 containment | Clean checkout and all required checks pass; failures block delivery |
| 3 | **WP-03 — Identity, request, email, header, and onboarding hardening** | RISK-004, 005, 008, 009, 017 | One role authority, session revocation, CSRF protection, safe email/headers, passwordless invitation | WP-01, WP-02 | Security regression and deployed-response checks pass |
| 4 | **WP-04 — Document, logical-version, and staged-upload foundation** | RISK-003, 007, 015, 026 | Many files per logical version, one document policy, verified finalize/abort uploads | WP-02, WP-03 | Migration reconciled; multi-file, ACL, scan, retry, and concurrency tests pass |
| 5 | **WP-05 — Append-only audit and transactional communications** | RISK-016, 020 | Attributable transitions and durable outbox/retry/deduplication | WP-02; coordinate with WP-04 | No direct lifecycle email; atomicity, recovery, and trigger-matrix tests pass |
| 6 | **WP-06 — Approved CERPS programme, lifecycle, role, and terminology baseline** | RISK-034 | One dated, source-backed target workflow, RACI, state model, and glossary | Research may start now; approval before WP-07–13 | Department/Faculty owner signs decisions and documented deviations |
| 7 | **WP-07 — Conditional ethics and progress-obligation redesign** | RISK-012, 013 | Honest ethics applicability/status plus six-month reports and yearly FHDC panel review | WP-04, WP-05, WP-06 | Policy, migration, obligations, panels, and downstream gates agree in E2E tests |
| 8 | **WP-08 — Unified version-bound review workflow** | RISK-011, 025 | Explicit proposal/progress/thesis assignments, evidence, review, release, and candidate view | WP-04–07 | Assigned Examiner → admin release → candidate browser E2E passes for each review type |
| 9 | **WP-09 — Board-governed viva and correction workflow** | RISK-014, 027 | Board membership/quorum, recommendations, ratified outcome, ordered corrections and certification | WP-04–06; reuse WP-08 evidence patterns | Multi-member Board/viva/correction E2E and state-machine tests pass |
| 10 | **WP-10 — Registration, completion, graduation, archive, and access consistency** | RISK-018, 019 | Governed renewals and one atomic terminal lifecycle command | WP-05, WP-06, WP-09 | Database invariants and failure-injected atomic finalization tests pass |
| 11 | **WP-11 — Evidence-first admin decisions and applicant tracking** | RISK-021, 028 | Discoverable queues, secure public reference, evidence/reason-gated decisions | WP-04–06, WP-08, WP-09 | Application/proposal/correction decision and communication E2E pass |
| 12 | **WP-12 — Notification center and operational reporting/export UX** | RISK-024, 033 | Accurate unread state, deep links, failure recovery, and full safe exports | WP-05, WP-11; stable destination routes | >8 unread, read-state, retry, link, authorization, and export tests pass |
| 13 | **WP-13 — Shared UI templates, corrected KPIs/navigation, and accessibility** | RISK-022, 023, 031 | Reusable shadcn-admin patterns with accurate metrics, identity, routes, and WCAG evidence | WP-06–12 | Template contracts, link crawl, visual regression, and accessibility checks pass |
| 14 | **WP-14 — Operational resilience and recovery readiness** | RISK-030 | Job monitoring, backup/restore, retention/privacy, incident and DR readiness | Starts after WP-02; closes after affected services | Alert and isolated restore drills meet approved RPO/RTO |
| 15 | **WP-15 — Retired-surface cleanup and documentation normalization** | RISK-032 | Remove inert/test/duplicate/retired surfaces after replacements are proven | All replacement packages, especially WP-07/08/13 | Clean and upgraded DB migrations pass; route/catalogue/report match deployment |

Safe parallelism after WP-02 is limited to separately coordinated branches for WP-03, WP-04, WP-05, WP-06 research, and the initial work of WP-14. Their schema and event contracts must be reviewed together before merging.

### 17.2 Detailed implementation plan

#### WP-01 — Emergency containment and access-control hotfix

**Goal.** Close the three immediately exploitable paths without waiting for a broader redesign.

**Primary implementation areas:**

- `src/app/api/auth/claims/route.ts` and `src/lib/firebase/claims.ts` (removed by the WP-01 patch).
- `src/lib/documents.ts`, `src/app/api/documents/[id]/route.ts`, and proposal/progress/thesis review-attachment services.
- `src/app/api/cron/check-registrations/route.ts`, `prisma/schema.prisma`, and the additive maintenance-run migration.
- Proposal/thesis submission schemas, submission panels, and focused security/integration/DOM regression tests.

**Implementation steps:**

1. Block `/api/auth/claims` and the scheduler route at the deployment edge while code is prepared.
2. Remove the claims route if it is a development helper. If retained, require an active Administrator, recent privileged reauthentication, target validation, safe transition rules, session revocation, and immutable audit.
3. Reconcile Firebase UIDs/claims with local users and investigate unauthorized changes before enforcing the repaired authority model.
4. Exclude `REVIEW_ATTACHMENT` from generic Student/Supervisor repository listing and download paths.
5. Expose review attachments only through their parent review after assignment, relationship, and `releasedAt` checks.
6. Convert the scheduler to authenticated POST, fail closed when job identity/secret is absent, validate a timestamped signature or platform identity, and use an idempotent run key.
7. Until WP-04 is deployed, enforce the documented one-file proposal/thesis limit in server validation so a valid-looking multi-file request cannot corrupt current-version behavior. This is a temporary mitigation, not closure of RISK-003.

**Verification and rollout:** Anonymous/non-admin role changes fail; self-promotion, unsafe UID relinking, and unsupported transitions fail; unreleased attachments return 403; valid released access works; missing/expired/replayed scheduler credentials fail without duplicate changes or notices; a multi-file proposal/thesis attempt is rejected clearly until WP-04. Deploy edge blocks first. A rollback must never reopen a public claims route, release-blind attachment path, or fail-open scheduler.

**Checkpoint:** Code implementation and local verification are complete. See Section 15.2 for exact evidence, the additive migration, deployment/reconciliation checklist, and residuals. WP-01 is not `Verified` and its owned risks are not closed until the deployed exit gate in Section 17.1 is satisfied.

#### WP-02 — CI safety net and dependency stabilization

**Goal.** Make later migrations safer and move the application to supported patched dependencies.

**Primary implementation areas:** `package.json`, `package-lock.json`, `.github/workflows/*`, Prisma validation scripts, `tests/e2e`, disposable service fixtures, and a secret-free `.env.example`.

**Implementation steps:**

1. Triage every audit advisory for reachability and supported upgrade path.
2. Upgrade in controlled batches: Next/React, Firebase, mail/monitoring/storage clients, then development tooling.
3. Add explicit scripts/checks for type checking, lint, unit, integration, Playwright, build, Prisma generate/validate, and migration dry-runs.
4. Test against disposable PostgreSQL and appropriate Firebase/storage emulators or isolated test services.
5. Add dependency audit, secret scanning, SAST, accessibility smoke checks, and migration-drift detection.
6. Require the checks for protected-branch merge and deployment; document any time-bounded, owner-approved exception.

**Verification and rollout:** A clean checkout succeeds with `npm ci`; deliberate test and migration failures block delivery; migrations pass on an empty database and a sanitized current-schema copy; no unaccepted reachable critical/high advisory remains. Retain the prior deploy artifact and lockfile for application rollback, but retain the CI gates.

**Checkpoint:** The supported dependency baseline, clean local gates, empty-database migration/drift checks, real PostgreSQL smoke, browser/accessibility smoke, CI/CodeQL/Dependabot definitions, environment template, and migration policy are implemented and locally verified. The inherited destructive migration remains correctly blocked for populated production data. See Section 15.2 and `docs/operations/CI_AND_MIGRATION_GATES.md`. WP-02 is not `Verified` until hosted protections/runs, sanitized populated-data rehearsal, external-service E2E, and deployment evidence are recorded.

#### WP-03 — Identity, request, email, header, and onboarding hardening

**Goal.** Make authorization and browser/email trust boundaries consistent.

**Primary implementation areas:** `src/lib/firebase/auth.ts`, Firebase admin/session helpers, authorization wrappers, session route, a central mutation-security helper, `next.config.mjs`, `src/lib/email.ts`, and user/admission onboarding.

**Implementation steps:**

1. Define the local active user and role as request-time authority; treat the Firebase claim as an identity hint and fail closed on mismatch.
2. Revoke or version sessions after role changes, deactivation, or UID relinking; audit mismatches and privileged changes.
3. Apply central CSRF/request-origin protection to every cookie-authenticated POST/PUT/PATCH/DELETE and remove any state-changing GET.
4. Escape all email text values by default and validate links independently.
5. Replace generated/emailed passwords with expiring, one-time Firebase account-setup/reset invitations.
6. Add CSP first in report-only mode, then enforce it with `nosniff`, clickjacking, referrer, and permissions policies.
7. Upload source maps privately to monitoring and prevent public serving unless explicitly accepted.

**Verification and rollout:** Role/claim mismatch and old sessions fail safely; cross-origin/missing-token mutations fail; hostile email values remain text; no password appears in mail, response, storage, or logs; reused/expired setup links fail; deployed headers pass. Reconcile roles before strict mismatch enforcement and observe CSP before enforcing it.

#### WP-04 — Document, logical-version, and staged-upload foundation

**Goal.** Make every multi-file submission a coherent logical version and make storage completion a prerequisite for domain creation.

**Primary implementation areas:** `prisma/schema.prisma`, expand/backfill/contract migrations, `src/lib/storage.ts`, document authorization, proposal/thesis version services, and all public/application/proposal/ethics/progress/thesis/correction upload flows.

**Implementation steps:**

1. Add `ProposalVersion` and `ThesisVersion` aggregates with many document rows and one database-enforced current version per parent.
2. Point review assignments to the exact logical version/evidence manifest.
3. Implement one central authorization policy used by every list and signed-download path; encode the approved Supervisor policy once and create one immutable access event per sensitive download.
4. Add staged upload sessions with server-generated sealed paths, expected metadata, expiry, abort, retry/resume, and idempotent finalize.
5. Finalize only after object existence, real size, checksum, magic bytes, allowed archive contents, and malware/quarantine state are verified.
6. Protect public drafts using hashed capability tokens, rate/abuse controls, and approved bot protection. Prevent overwriting finalized paths.
7. Backfill legacy proposal/thesis rows into logical versions; isolate ambiguous records for manual resolution.
8. Use expand → backfill → dual read/write comparison → cutover. Drop legacy structures only in WP-15.

**Verification and rollout:** One to ten files behave as one version; concurrent submissions cannot create two current versions; all download routes agree; failed/partial PUT creates no final record or notice; retry is idempotent; spoofed MIME, size/hash mismatch, archive abuse, replay, and expired draft fail; cleanup preserves finalized objects. Roll back reads with a feature flag and freeze writes on reconciliation mismatch rather than deleting new data.

#### WP-05 — Append-only audit and transactional communications

**Goal.** Record who changed what and make every notification/email intent durable and recoverable.

**Primary implementation areas:** new lifecycle/audit/domain-event/outbox/delivery models, effective-dated assignments, `src/lib/notifications.ts`, `src/lib/email.ts`, mutation services, worker/job route, and admin retry tools.

**Implementation steps:**

1. Approve a versioned event catalogue containing aggregate/version, actor, correlation ID, recipient, action-route ID, and semantic event name.
2. Store append-only transitions and decisions with previous/new state, reason, evidence version, actor, and timestamp.
3. End assignments with effective date/reason instead of deleting history.
4. Write domain state, audit transition, and outbox row in one database transaction.
5. Deliver through a leased worker with retry/backoff, dead-letter state, idempotency, and a unique event/channel/recipient key.
6. Support internal users and external applicants without creating fake user accounts.
7. Replace direct/fire-and-forget email calls and add audited admin retry/requeue.
8. Backfill only truthful legacy snapshots; preserve unknown actor/reason as unknown.

**Verification and rollout:** Rolled-back domain transactions create neither audit nor outbox intent; worker crash/restart and duplicate lease do not duplicate user-visible intent; failures are inspectable and retryable; audit rows are immutable; every approved trigger has an automated matrix test. Start with dual logging and a shadow/disabled worker. A rollback stops the worker but retains the outbox for later replay.

#### WP-06 — Approved CERPS programme, lifecycle, role, and terminology baseline

**Goal.** Freeze the target policy before changing lifecycle code, permissions, routes, emails, reports, or reusable workflow UI.

**Deliverables:**

- A dated official-source register and current-versus-target gap matrix.
- Approved programme scope, state diagrams, transition guards, deadlines, role/RACI matrix, notification obligations, and terminology glossary.
- A decision/deviation log separating explicit University rules from Department-approved local behavior and implementation conveniences.
- Stable policy IDs used by requirements, tests, migrations, and this report.

**Required decisions:** programme scope; proposal placement; institutional roles and delegated authority; annual review-panel membership; Board/external-examiner rule; ethics applicability/ownership; hard-copy/digital equivalence and signature standard; registration/leave/transfer/readmission scope; correction and final-copy evidence; completion/graduation/archive/account-access separation; notification channels/wording; and fees/configuration ownership.

**Verification and rollout:** The Department/Faculty product owner signs the scope, RACI, state diagrams, gates, glossary, and each intentional deviation. Introduce display labels and compatibility aliases before stored-enum changes; never rewrite historical decisions silently.

#### WP-07 — Conditional ethics and progress-obligation redesign

**Goal.** Replace document-presence semantics and retired/incorrect progress logic with the approved University-aligned models.

**Primary implementation areas:** ethics and progress models/services/routes/pages, scheduler, and migrations for obligations, reviews, decisions, panels, and legacy classification.

**Implementation steps:**

1. Begin ethics with an applicability declaration. For applicable research, model submitted, under review, revisions requested, resubmitted, approved/not approved, expired/closed, ERC reference, conditions, dates, and approval evidence. Gate the approved policy point—normally data collection—not every research activity.
2. Mark legacy ethics rows as unverified evidence unless their approval can be proven; do not silently promote them.
3. Generate six-month progress obligations from the effective registration date until final thesis examination.
4. Capture Student report, Supervisor assessment, HOD observations/escalation, and yearly FHDC-appointed panel review with outcome and actions.
5. Calculate overdue from unmet/late obligations, grace/exemption rules, and timezone—not age of an unsigned Boolean.
6. Preserve legacy retired data read-only through migration; remove it only in WP-15.

**Verification and rollout:** Ethics applicability, revisions, expiry, exemption, and downstream gates agree; missing/on-time/late/exempt/revised obligations work; annual panel nomination/recommendation and poor-performance escalation work; scheduler replay is idempotent; no active UI depends on a `410` route. Enable by programme/cohort and show reconciled legacy state explicitly.

#### WP-08 — Unified version-bound review workflow

**Goal.** Provide usable least-privilege proposal, progress, and thesis review from assignment through release.

**Implementation steps:**

1. Use common assignment/review states while keeping domain-specific forms and decision rules.
2. Bind every assignment to an exact logical version and frozen evidence manifest.
3. Enforce assignment, conflict checks, due dates, least privilege, and peer-review visibility rules.
4. Build Examiner work queues/forms, Administrator return/release queues, and candidate released-review views.
5. Migrate existing reviews and mark ambiguous version relationships for manual resolution.
6. Emit assignment, due/overdue, submission, return, release, reassignment, and cancellation events through WP-05.

**Verification and rollout:** Unassigned Examiners receive 403; assigned Examiners see only permitted evidence and reviews; candidate access requires release; reassignment preserves history; proposal, progress, and thesis each pass full Examiner → Administrator → candidate browser E2E. Roll out one review domain at a time behind flags.

#### WP-09 — Board-governed viva and correction workflow

**Goal.** Replace the single shared Examiner result with an approved Board process and traceable correction orders.

**Primary implementation areas:** Board/membership/approval models, `Viva`, independent recommendations, ratified decision, correction requirement/items/submissions/certification, `src/lib/vivas.ts`, correction services, and role pages.

**Implementation steps:**

1. Model Board nomination, institutional approvals, chair, members/roles, external affiliation, observers, conflicts, quorum, meeting, and evidence distribution.
2. Enforce the required candidate notice period and scheduled-date/timezone guard.
3. Store independent member reports/recommendations; only the authorized Board/chair/administrative ratification creates the collective outcome.
4. Support the approved outcomes, reasons, dissent, lower-qualification/resubmission paths, and possible re-examination.
5. Generate correction orders tied to the examined thesis/version with type, instructions/items, due date, reviewer, and disposition.
6. Prevent Student-selected incompatible types, alternate thesis resubmission bypass, and finalization while mandatory items remain unresolved.
7. Require final correction certification and fully bound/final-copy evidence before completion.

**Verification and rollout:** Members cannot overwrite each other; pre-viva/unassigned actions fail; Board composition, notice, quorum, and ratification are enforced; corrections match the decision/version and block bypasses; multi-member E2E covers result, communications, corrections, certification, and final state. Freeze outcome entry during migration; preserve legacy decisions as explicitly legacy.

#### WP-10 — Registration, completion, graduation, archive, and access consistency

**Goal.** Separate and atomically coordinate academic, registration, retention, and account states.

**Implementation steps:**

1. Implement the WP-06 state model for provisional/regular registration, annual renewal, lapse, withdrawal, postponement, leave, transfer, supervisor/registration change, cancellation, readmission, and completion to the approved project scope.
2. Replace immediate renewal with a request, eligibility/evidence/fee verification, approval, and idempotent transition where required.
3. Enforce one active non-overlapping registration at database level and reconcile legacy overlaps first.
4. Implement one atomic completion/finalization command covering thesis/corrections/final-copy certification, academic state, registration closure, audit, and outbox.
5. Treat graduation/award, record archive/retention, and local/Firebase account deactivation as separate governed actions.
6. Suppress renewals/reminders for terminal/ineligible states and make reports use canonical state rather than mixed flags.

**Verification and rollout:** Concurrent renewal creates one valid period; ineligible/terminal candidates cannot renew or receive reminders; injected failure leaves no partial finalization; repeat commands are idempotent; archive/graduation reports match the approved definitions. Reconcile data before enabling constraints; do not reverse a real academic decision through a blind rollback.

#### WP-11 — Evidence-first admin decisions and applicant tracking

**Goal.** Keep administrative work visible and make high-impact decisions attributable and evidence-backed.

**Implementation steps:**

1. Create queues spanning Submitted and Under Review with owner, age/SLA, filters, reassignment, escalation, and drill-down.
2. Generate an opaque public application reference and a rate-limited secure status channel that exposes only approved public information.
3. Notify applicants of receipt, review, requests, and decision with approved public reasons.
4. Place the exact permitted evidence/version/reviews beside proposal, application, and correction decision controls.
5. Require structured reason and accessible confirmation for rejection, return, approval, deactivation, archive, graduation, and comparable consequential actions.
6. Record actor, evidence version, reason, and time through WP-05 without deleting earlier ownership/history.

**Verification and rollout:** Under-review work remains discoverable; public references are unguessable; internal notes remain private; decisions cannot complete without required evidence/reason; application/proposal/correction E2E covers queue, decision, audit, and communication. Backfill references safely and retain them if the public UI is rolled back.

#### WP-12 — Notification center and operational reporting/export UX

**Goal.** Expose the reliable event platform as an accurate actionable UI and complete reporting surface.

**Implementation steps:**

1. Return authoritative unread total independently of the current page size.
2. Fix the dashboard trigger so the actual sidebar item—not only its unused fallback—renders icon, label, and unread badge.
3. Add pagination, refresh-on-open/polling, individual/bulk read, view-all, action links, and concurrent read-state handling.
4. Add delivery state, latency, failure reason, dead-letter ownership, and audited retry/requeue to the admin log.
5. Generate action URLs from typed route IDs in the event catalogue, not user-controlled arbitrary URLs.
6. Add authorized, audited, asynchronous full filtered exports with expiry, row/size limits, safe signed download, and CSV formula-injection protection.
7. Add saved filters, trends, ownership, and drill-down from operational metrics.

**Verification and rollout:** More than eight unread items still shows the true count; read/bulk-read/pagination remain consistent; every action route exists and authorizes the user; retries deduplicate; full export row count matches its filter rather than the visible page; large/expired/unauthorized/formula-injection cases fail safely.

#### WP-13 — Shared UI templates, corrected KPIs/navigation, and accessibility

**Goal.** Consolidate repeated presentation after domain contracts are stable, without placing business authorization or transitions inside generic components.

The concrete component and migration design is in Section 17.4. This package also owns the metric dictionary, authenticated profile identity, typed route manifest, removal/correction of dead actions, one-main/one-page-heading semantics, accessible confirmation, and WCAG 2.2 AA verification.

**Verification and rollout:** API metrics equal their named drill-down datasets; all role links resolve; reusable component contract tests and visual regression pass; keyboard, screen-reader semantics, 320 px, 400% zoom, contrast, reduced-motion, dialog focus, and mobile navigation pass or have an explicit accepted exception. Migrate route by route behind flags so a presentation rollback does not reverse domain fixes.

#### WP-14 — Operational resilience and recovery readiness

**Goal.** Make jobs, backups, documents, privacy/retention, and incident recovery owned, observable, and rehearsed.

**Implementation steps:**

1. Document environment topology, infrastructure ownership, secrets rotation, and deployment/rollback process.
2. Monitor scheduler, outbox, cleanup, scan, and export jobs for last success, duration, lag, failure, retry exhaustion, and owner escalation.
3. Approve data classification, retention, legal hold, archive, privacy access/correction/deletion, and storage lifecycle rules.
4. Configure encrypted database backups and object-storage retention/version controls.
5. Approve RPO/RTO and write restore, job failure, notification backlog, storage incident, auth compromise, and deployment rollback runbooks.
6. Restore database and objects into isolated infrastructure, then verify hashes and relationships.

**Verification and rollout:** Missed jobs and dead-letter backlog alert the correct owner; an isolated timed restore meets RPO/RTO; restored metadata and objects reconcile; incident table-top exercises produce executable steps; test records prove retention/deletion/legal-hold rules. Operational controls are additive and must not be tested destructively against production.

#### WP-15 — Retired-surface cleanup and documentation normalization

**Goal.** Remove confusing legacy surfaces only after replacements and migrations are verified.

**Implementation steps:**

1. Inventory reachability and real traffic before deletion.
2. Deprecate/instrument legacy routes, redirect duplicated Student progress paths, and remove/quarantine empty and production test routes.
3. Remove retired sign-off/panel code only after WP-07/08 E2E passes.
4. Drop retired schema in a separate contract migration after backup, reconciliation, and the deprecation window.
5. Generate route/API/state catalogues from source metadata where practical.
6. Archive stale workflow documents with a superseded notice and keep this report canonical.

**Verification and rollout:** No empty, test-only, duplicate, or active `410` workflow route remains; redirects and compatibility tests pass; no live reference targets removed schema; migrations pass on clean and upgraded databases; generated catalogues and this report match deployed behavior. Keep a tagged deploy and backup through the deprecation window.

### 17.3 CERPS and Computer Engineering policy-alignment baseline for WP-06

The following is a **planning evidence baseline**, not yet an approved replacement lifecycle. The primary source is the CERPS [General Regulations for Postgraduate Programmes](https://cerps.pdn.ac.lk/wp-content/uploads/2025/07/REGULATIONS.pdf), which the [CERPS downloads page](https://cerps.pdn.ac.lk/downloads/) identifies as effective from 9 June 2021. The Department of Computer Engineering's [current postgraduate page](https://www.ce.pdn.ac.lk/courses/postgraduate/) advertises research-based MPhil and PhD degrees and directs applicants to CERPS for entry requirements.

#### Published workflow differences that materially affect the redesign

| Area | Published University/CERPS evidence | Consequence for PGLMS planning |
|---|---|---|
| Product scope | The Computer Engineering page advertises MPhil/PhD; Faculty regulations also cover PGDip, MEng, Masters, MScEng, and MSc. | Decide Department-only MPhil/PhD versus Faculty-wide product before changing programme enums, labels, durations, or dashboards. |
| Application and proposal | Research applications are year-round and include the proposal and supervisor consent; at least one Supervisor is a permanent Faculty academic. The official form includes two proposal reviewers, HOD resource recommendation, Director/CERPS observation, FHDC decision, and later approvals/ratification. See [application procedure](https://cerps.pdn.ac.lk/application-procedure/) and [research-degree application form](https://cerps.pdn.ac.lk/wp-content/uploads/2025/07/Application-Form-for-Registration-for-Research-Degree-Programmes.pdf). | The current separate post-admission proposal milestone is not the published default. Either move proposal/supervisor consent into application or record an approved Department deviation. Add the institutional decision chain instead of collapsing it into one Administrator. |
| Registration | Research registration date is determined through FHDC; annual renewal is required. The regulations also describe withdrawal, postponement, registration/supervisor changes, cancellation, leave/release, transfer, and readmission. See [registration procedure](https://cerps.pdn.ac.lk/registration-procedure/). | Renewal cannot remain an unconditional date extension. Model approved candidature states, evidence, dates, decision authority, and history to the agreed Department scope. |
| Progress | MPhil/PhD reports are due every six months from registration through Supervisor to HOD. Yearly reports are reviewed by an FHDC-appointed panel; the [progress template](https://cerps.pdn.ac.lk/wp-content/uploads/2025/07/Template-for-Half-yearlyYearly-Progress-Reports-of-MPhilPhD-Candidates.pdf), [panel nomination form](https://cerps.pdn.ac.lk/wp-content/uploads/2025/07/Template-for-Nomination-of-Review-Panels-for-MPhil-PhD-Yearly-Progress-Reports.pdf), and [panel recommendation form](https://cerps.pdn.ac.lk/wp-content/uploads/2025/07/Template-for-Submission-of-Review-Panel-Recommendation-of-MPhilPhD-Yearly-Progress-Reports.pdf) remain published. | The active code's retired panel/sign-off semantics conflict with current published rules. Restore a policy-aligned six-month obligation and yearly panel workflow instead of merely deleting panel concepts. |
| Thesis and Board | Supervisors certify thesis suitability on Form 7.2A; submission passes through HOD to the Assistant Registrar. HOD proposes a Board, FHDC recommends, Faculty Board approves, and Senate ratifies. MPhil/PhD Board composition includes HOD/representative as chair, an external expert, University academics, and Supervisors as observers. See the [examiner page](https://cerps.pdn.ac.lk/appointment-of-examiners-for-thesis/) and current regulations. | Model a Board, its roles, nomination/approval history, and external affiliation; a few independent internal user assignments are insufficient. |
| Viva, corrections, completion | MPhil/PhD requires thesis examination and viva; candidate notice is at least three weeks; Board quorum excludes Supervisors; decisions can require corrections, additional work, resubmission, lower qualification, or rejection. Completion depends on correction certification and final bound copies. See [thesis submission/evaluation](https://cerps.pdn.ac.lk/format-submission-and-evaluation-of-thesis/). | Replace single-Examiner `PASS/MINOR/MAJOR/FAIL` with collective Board decisions, correction orders, re-examination paths, certification, final copies, and effective-completion logic. Do not graduate/archive immediately on a simple pass value. |
| Ethics | Ethics is governed separately by the Faculty ERC-FoE. Clearance applies to research involving human participants, animals, or ecosystem resources; the [Faculty guidelines](https://eng.pdn.ac.lk/erp/guidelines.php) describe review timing and current-form requirements. | Start with applicability; do not call every uploaded document an approval. For applicable research, track ERC review/revisions/reference/approval and gate data collection according to approved Faculty practice. |

#### Decisions that require Department/Faculty confirmation

1. Is PGLMS strictly for Computer Engineering MPhil/PhD, or intended to support the wider Faculty programme set?
2. Must proposal and Supervisor consent be part of the initial application, or has the Department approved a post-admission proposal stage?
3. Which functions require distinct scoped positions: applicant, Student, Supervisor, proposal reviewer, HOD/nominee, Postgraduate Coordinator, Director/CERPS, Assistant Registrar, FHDC, Faculty Board, Senate, annual review panel, Board of Examiners, and ERC-FoE?
4. For MPhil/PhD, must the external Examiner be outside the University (current regulations) or merely outside the Faculty (one CERPS web page)?
5. Must the yearly panel expert be outside the Department, as the published forms indicate?
6. Which paper signatures/copies can be represented digitally, and what constitutes an accepted digital certification?
7. Which ethics cases are applicable, who enters the official ERC decision, and where should data-collection gating occur?
8. What are the approved notification channels, decision/report deadlines, major-correction deadlines, appeal/plagiarism/publication rules, completion/award/graduation steps, and fee/configuration ownership where the public sources are silent?

Any unresolved item must become an explicit `Open policy decision` in WP-06; it must not be silently guessed in code.

### 17.4 Shared UI template architecture for WP-13

The UI audit found the dashboard page shell repeated in 20 files, page-header/title styling repeated across 13/23 files, hand-built error/success banners in roughly 20/13 files, six upload implementations, six independent table/loading/empty patterns, and local status/date formatting across many panels. `progress-report-submission-form.tsx` is the strongest visual outlier, using raw controls, two-pixel black borders, oversized radii, and a simulated 3D button that conflicts with the repository's shadcn-admin theme.

#### Functional UI corrections that precede visual consolidation

1. Pass authenticated identity to `ProfileDropdown`; remove the hard-coded Administrator/email shown to every role and do not link Profile/Settings to nonexistent `/dashboard/settings` pages.
2. Fix the hidden notification badge: `DashboardRoleLayout` currently provides a custom trigger while `DashboardNotificationsMenu` renders the count only in its unused fallback trigger.
3. Create a typed React-free route/capability manifest in `src/lib/dashboard/routes.ts`; sidebar, quick actions, notification actions, and profile links must reference route IDs from it.
4. Keep exactly one `<main>` and one page `<h1>`; remove nested main landmarks and make the persistent dashboard label non-heading content.
5. Associate every `Label`/Select trigger with its control and introduce one accessible confirmation pattern for destructive or academically consequential actions.

#### Proposed reusable components

| Layer | Proposed file(s) | Responsibility and boundary |
|---|---|---|
| shadcn primitives | `src/components/ui/alert.tsx`, `alert-dialog.tsx`, `checkbox.tsx` | Standard feedback, confirmation, and checkbox behavior; replace custom boxes, raw checkbox, and `window.confirm`. |
| page shell | `src/components/dashboard/dashboard-page.tsx`, `page-header.tsx` | Standard dashboard wrapper, single page title, description, metadata, back link, and actions using `Card`, `Button`, and spacing conventions. |
| feedback/state | `src/components/dashboard/page-feedback.tsx`, `async-state.tsx` | Consistent error/success/warning/info live regions plus loading, retry, and empty states. |
| metrics/filters/table | `metric-card.tsx`, `filter-card.tsx`, `data-table-card.tsx` | Shared KPI, search/filter card, and table/pagination composition; domain modules still own queries, columns, and row actions. |
| workspaces | `master-detail-workspace.tsx`, `workflow-record-card.tsx` | Responsive list/detail and record-card slots for assignments, queues, vivas, corrections, and reviews without embedding permissions. |
| forms | `src/components/forms/form-field.tsx`, `form-section.tsx`, `form-actions.tsx`, `loading-button.tsx` | Enforce ID/label/help/error relationships and pending/double-submit behavior using standard controls. |
| uploads | `document-upload-field.tsx`, `uploaded-file-list.tsx`; later `src/lib/client/upload-files.ts` | One accessible picker/list presentation. Client transport is added only after WP-04; domain request/finalization rules remain in domain services. |
| statuses/dates | `src/components/workflow/workflow-status-badge.tsx`, `src/lib/presentation/workflow-status.ts`, `src/components/common/date-time.tsx`, `src/lib/presentation/formatters.ts` | Exhaustive approved labels/variants and timezone-aware `<time>` rendering; remove local underscore replacement, color maps, and date helpers. |
| workflow composition | `submission-workspace.tsx`, `decision-panel.tsx`, `review-workspace.tsx` | Slot-based evidence/form/history/decision layouts added after WP-06; never authorize users or decide transitions. |
| consequential actions | `src/components/common/confirm-action-dialog.tsx` | Accessible named confirmation for deactivation, archival, rejection, viva decision, correction acceptance, graduation/finalization, and assignment removal. |

All dashboard work must follow the `shadcn_admin_theme` conventions already present in the repository: standard `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Button`, `Badge`, `Input`, `Select`, `Textarea`, and `Table`; clean spacing; no custom heavy black borders, neumorphism, or simulated 3D controls.

#### UI migration order

1. **UI-0 — prerequisites:** complete WP-01, define WP-04 file/version behavior, stabilize WP-05 notification contracts, and approve lifecycle/state/role rules in WP-06.
2. **UI-1 — functional repair:** real profile identity, unread badge, typed routes, no placeholder actions, landmark/heading corrections, and accessible confirmation.
3. **UI-2 — foundations:** build and component-test the page, feedback, async, status, metric, form, confirmation, filter, table, and master/detail patterns.
4. **UI-3 — low-risk read-only pages:** dashboard summary, repository, notification log, application list, user directory, Supervisor roster, progress history/monitoring, and Student progress/profile.
5. **UI-4 — administrative mutation pages:** Supervisor/Examiner assignment, application/proposal decisions, viva scheduling/outcome, and thesis/correction finalization. Preserve server authority, pending state, confirmation, double-submit prevention, and deterministic refresh.
6. **UI-5 — upload/submission pages:** only after WP-04, migrate progress first, then proposal, ethics, thesis, corrections, and public application.
7. **UI-6 — missing CERPS-derived workflows:** build proposal review, annual panel, Board, review release, and other approved pages from shared patterns rather than new standalone panels.
8. **UI-7 — cleanup:** remove repeated shells, hand-built feedback, hard-coded workflow colors, local enum/date helpers, raw controls, `window.confirm`, and confirmed-unused theme rules.

#### UI acceptance and test evidence

- Unit/component tests for semantics, variants, disabled/pending states, labels, keyboard behavior, and live regions.
- Representative integration tests for a table, master/detail workspace, upload flow, and destructive decision.
- Playwright coverage for Student, Supervisor, Examiner, and Administrator navigation at desktop and 360 px.
- Keyboard-only operation, dialog focus return, error focus, double-submit prevention, authorized notification links, and no page-level horizontal overflow.
- Automated accessibility scanning such as `@axe-core/playwright` plus visual screenshot regression for each shared state.
- Every migrated page has one main/page heading, labelled controls, textual status, contained responsive table, accessible file status/removal, explicit timezone for deadline/viva times, WCAG AA contrast, and reduced-motion support.

### 17.5 Risk-ownership completeness check

| Package | Risks owned exactly once |
|---|---|
| WP-01 | RISK-001, RISK-002, RISK-006 |
| WP-02 | RISK-010, RISK-029 |
| WP-03 | RISK-004, RISK-005, RISK-008, RISK-009, RISK-017 |
| WP-04 | RISK-003, RISK-007, RISK-015, RISK-026 |
| WP-05 | RISK-016, RISK-020 |
| WP-06 | RISK-034 |
| WP-07 | RISK-012, RISK-013 |
| WP-08 | RISK-011, RISK-025 |
| WP-09 | RISK-014, RISK-027 |
| WP-10 | RISK-018, RISK-019 |
| WP-11 | RISK-021, RISK-028 |
| WP-12 | RISK-024, RISK-033 |
| WP-13 | RISK-022, RISK-023, RISK-031 |
| WP-14 | RISK-030 |
| WP-15 | RISK-032 |

This matrix accounts for RISK-001 through RISK-034 with no missing or duplicate owner. Cross-cutting work may contribute to several outcomes, but only the owning package may claim closure of its listed risk.

### 17.6 Work-package progress tracker

| Package | Status | Owner | Issue/branch/PR | Migration/backfill class | Verification/deployment evidence |
|---|---|---|---|---|---|
| WP-01 | Implemented (committed; deployment pending) | Codex (code); project owner/deployer pending | Commit `9949fb8` on `main` | Additive `MaintenanceRun` ledger plus identity/document/data reconciliation; no destructive schema change | Focused 10/49, full 82/264, Prisma validation, and build pass locally; migration, scheduler cutover, reconciliation, and deployed smoke evidence pending |
| WP-02 | Implemented (local; hosted enforcement pending) | Codex (code/docs); repository administrator/deployer pending | `main` working tree; commit/PR pending | Supported dependency/CI baseline; guarded empty-database migration validation; populated destructive migration remains blocked | Clean install; 0 critical/high audit; lint/type; 81/263 ordinary tests + 1 real-DB test; four migrations/drift; build; 2/2 browser smokes. Hosted protections/runs, populated rehearsal, external-service E2E, and deployment evidence pending |
| WP-03 | Proposed | Unassigned | — | Auth/session and optional invitation/session-version expansion | — |
| WP-04 | Proposed | Unassigned | — | Expand → backfill → dual operation → cutover → WP-15 contract | — |
| WP-05 | Proposed | Unassigned | — | Additive audit/outbox; dual logging then worker cutover | — |
| WP-06 | Proposed | Unassigned | — | Policy/terminology; compatibility aliases before enum changes | — |
| WP-07 | Proposed | Unassigned | — | Additive obligation/decision/panel models; legacy state classified | — |
| WP-08 | Proposed | Unassigned | — | Version-bound assignment/review expansion and reconciliation | — |
| WP-09 | Proposed | Unassigned | — | Board/decision/correction expansion; legacy outcome reconciliation | — |
| WP-10 | Proposed | Unassigned | — | Registration reconciliation, constraint addition, atomic command | — |
| WP-11 | Proposed | Unassigned | — | Opaque-reference/queue/decision metadata backfill | — |
| WP-12 | Proposed | Unassigned | — | Compatible notification fields; optional export-job expansion | — |
| WP-13 | Proposed | Unassigned | — | Route-by-route presentation migration; no business-data rewrite | — |
| WP-14 | Proposed | Unassigned | — | Infrastructure/runbooks/retention and isolated recovery evidence | — |
| WP-15 | Proposed | Unassigned | — | Final contract/drop migration after deprecation and backup | — |

### 17.7 Mandatory report-update procedure during implementation

For each work package:

1. **Before coding:** assign owner and issue/branch; mark the related CHG/WP `Approved` then `In progress`; add approved policy decisions and migration/rollback plan. Do not change a “Current behavior” section to describe undeployed code.
2. **During implementation:** record schema migrations, compatibility flags, data reconciliation, test additions, notification changes, role/permission changes, and any scope decision. Keep risk status open.
3. **After code verification:** mark `Implemented`, cite commit/PR and automated/manual evidence, but do not yet claim deployed behavior.
4. **After deployment verification:** update document control, capability matrix, affected roles/permissions, workflow sequences/state tables, notification trigger matrix, dashboard/API catalogue, test/operations evidence, risk disposition, and this tracker. Only then mark `Verified`/`Mitigated`.
5. **If behavior differs from the plan:** record an approved decision/deviation rather than silently editing history. Preserve superseded states and effective dates.
6. **DOCX cadence:** keep this Markdown canonical and current after every accepted fix. By default regenerate and visually verify the DOCX once WP-15 and the final baseline audit are complete; create an interim DOCX only on request.

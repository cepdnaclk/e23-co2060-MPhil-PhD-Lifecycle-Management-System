# Project Overview

## 1. What This Project Is

This repository contains a **Postgraduate Lifecycle Management System** for managing the full MPhil/PhD journey in one platform.

It brings together the major academic and administrative workflows involved in postgraduate research:

- public programme applications
- admissions and student onboarding
- registration and renewal tracking
- proposal submission and review
- progress report submission and supervisor sign-off
- thesis submission and versioning
- viva scheduling and outcome recording
- correction upload and approval
- final archival and administrative oversight

In practice, this is not just a student portal. It is a **multi-role academic workflow platform** used by students, supervisors, examiners, and administrators across the entire research lifecycle.

---

## 2. Technology Stack

The project is built with:

- **Next.js 14 App Router** for pages, layouts, and route handlers
- **React 18** for the UI layer
- **TypeScript** for end-to-end type safety
- **Tailwind CSS** for styling
- **Prisma** as the ORM
- **Supabase Postgres** as the main relational database
- **Firebase Auth** for authentication and identity
- **Firebase Admin SDK** for secure server-side auth verification
- **Supabase Storage** for uploaded documents and file workflows
- **Zod** for shared validation
- **Nodemailer** for email delivery
- **SWR** for client-side data refresh
- **Vitest**, **Testing Library**, and **Playwright** for testing
- **Sentry** support for monitoring and error reporting

---

## 3. High-Level Purpose

The system manages the Department-level M.Phil./Ph.D. lifecycle from public
application through completion, confirmed graduation, and archive.

The typical flow is:

1. A public applicant submits an application.
2. The proposed Supervisor consents, assigned Proposal Reviewers assess the
   exact proposal version, and the HOD makes the Department decision.
3. The PG Coordinator executes approved admission and creates the fixed
   registration and six-month milestone schedule.
4. The Student submits milestone-bound progress versions; the active primary
   Supervisor returns or approves them.
5. Department ethics and thesis-readiness gates precede verified thesis
   submission and exact-version Examiner assignment.
6. Assigned Examiners submit independent reports and recommendations; the HOD
   records the viva outcome.
7. Ordered corrections use verified revised versions and Supervisor/Examiner
   review before HOD closure.
8. HOD completion approval, PG Coordinator completion execution, externally
   confirmed graduation, and later archive are separate controlled states.

This makes the project a combination of:

- a public-facing admissions portal
- a role-based internal dashboard
- a research milestone workflow engine
- a document submission and review platform

---

## 4. User Roles

The application supports five separate roles.

### Student

Students can:

- submit the proposal with the public application
- submit fixed-milestone progress versions
- track academic progress
- submit thesis documents
- submit verified ordered correction versions
- view released completion, graduation, and archive status

### Supervisor

Supervisors can:

- view assigned students
- record proposed-Supervisor consent and complete assigned proposal reviews
- return or approve primary-Supervisor milestone reports
- certify thesis readiness, ethics, and correction submissions
- monitor student progress and workload

### Examiner

Examiners can:

- access only explicitly assigned proposal/thesis versions
- submit independent thesis reports and viva recommendations
- review correction submissions when the exact assignment requires it

### Administrator

PG Coordinators (`ADMINISTRATOR`) can:

- manage user accounts
- operate application intake and proposal-review assignments
- execute HOD-approved admissions
- assign supervisors and examiners
- schedule vivas
- record HOD-approved completion, confirmed graduation, and archive
- access reporting and operational controls

### Head of Department

HOD users can:

- make final Department application decisions
- approve thesis readiness and confirm Examiner assignments
- record the final viva outcome and correction closure
- approve academic completion after all required evidence is satisfied

---

## 5. Repository Structure

At a high level, the project is organized like this:

```text
src/
  app/
  components/
  lib/
  types/

prisma/
tests/
.github/
```

### `src/app`

This is the **Next.js App Router** layer. It includes:

- public routes
- dashboard routes
- layouts
- route handlers under `src/app/api`

### `src/components`

This contains reusable and feature-level UI components, grouped by domain:

- `admin`
- `application`
- `auth`
- `dashboard`
- `examiner`
- `progress-reports`
- `proposals`
- `student`
- `supervisor`
- `ui`

### `src/lib`

This contains business logic and shared service modules, including:

- validation helpers
- dashboard summary logic
- database access helpers
- application workflows
- proposal workflows
- thesis workflows
- progress-report workflows
- viva workflows
- auth and monitoring helpers

### `src/types`

Shared TypeScript types used across the application.

### `prisma`

The Prisma schema and related database definitions live here.

### `tests`

This directory contains unit and integration tests, with end-to-end coverage prepared separately.

### `.github`

GitHub workflows and automation support files.

---

## 6. Frontend Structure

The app has two main user-facing areas:

### Public Pages

- `/` landing page
- `/apply` application form
- `/apply/success` application success page
- `/login` sign-in page

### Dashboard Pages

Role-based dashboards live under `/dashboard`, for example:

- `/dashboard/student`
- `/dashboard/supervisor`
- `/dashboard/examiner`
- `/dashboard/admin`

There are also role-specific subpages such as:

- student proposals
- student progress reports
- student thesis submission and corrections
- supervisor student roster and sign-off pages
- examiner viva workspace
- admin applications, assignments, scheduling, and finalization pages

### Shared Dashboard Shell

The main shared dashboard layout is:

- `src/components/dashboard/dashboard-role-layout.tsx`

This layout controls:

- sidebar navigation
- active route styling
- dashboard framing
- shared typography and page structure

Because all role dashboards flow through this shell, many dashboard-wide UI changes can be applied centrally.

---

## 7. API Layer

Backend logic lives under:

- `src/app/api`

This project uses **Next.js route handlers** rather than a separate Express or Nest application.

The API is organized by domain, including:

- `auth`
- `applications`
- `admin`
- `assignments`
- `dashboard`
- `documents`
- `notifications`
- `progress-reports`
- `proposals`
- `registrations`
- `review-panels`
- `students`
- `supervisor`
- `theses`
- `vivas`

So the repository is a **full-stack Next.js application** where frontend pages and backend endpoints live in the same codebase.

---

## 8. Core Business Areas

### Applications

This is the public admissions entry point. It includes:

- multi-step application submission
- supporting document upload
- validation and review status changes
- applicant-to-student transition support

### Authentication

Authentication is handled with Firebase and supports:

- login and identity verification
- session cookies
- role-aware access control
- authenticated dashboard access
- session activity tracking

### Dashboard

The dashboard layer provides:

- role-based summaries
- KPI cards
- quick actions
- route-aware access control
- server/client separation for summary rendering

### Proposals

This is one of the central workflows in the system. It includes:

- proposal submission
- document version handling
- supervisor evaluations
- administrator approval/rejection
- evaluation aggregation
- lifecycle transitions such as `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, and `REJECTED`

### Progress Reports

This area handles:

- student report submission
- reporting cycles
- supervisor sign-off
- milestone visibility

### Theses

This area supports:

- thesis submission
- versioned document management
- examiner assignment
- correction workflows
- final archival

### Vivas

This area handles:

- viva scheduling
- venue and date/time management
- outcome recording
- post-viva lifecycle transitions

### User Administration

Administrators can:

- create users
- deactivate users
- filter and manage accounts
- coordinate assignment and review workflows

### Notifications and Monitoring

The system also stores notification records and operational logs to support:

- user-facing notifications
- admin oversight
- failed-delivery auditing

---

## 9. Database Model Overview

The database schema is defined in:

- `prisma/schema.prisma`

The schema models the application around a central academic lifecycle.

### Main Entities

- `User`
- `Student`
- `Supervisor`
- `Examiner`
- `Administrator`
- `Application`
- `Registration`
- `ResearchProposal`
- `EvaluationForm`
- `ProgressReport`
- `ReviewPanel`
- `PanelMembership`
- `PanelEvaluation`
- `Thesis`
- `ThesisExaminerAssignment`
- `Viva`
- `CorrectionDocument`
- `Document`
- `Notification`
- `NotificationLog`

### Key Relationship Pattern

At a high level:

- a `User` may be linked to one role-specific record
- a `Student` may have an `Application`, multiple `Registrations`, multiple `ResearchProposals`, multiple `ProgressReports`, and multiple `Theses`
- a `ResearchProposal` can receive multiple `EvaluationForm` records
- a `Thesis` can have examiner assignments, viva data, correction documents, and versioned file records

### Important Enums

The schema relies heavily on enums to keep workflows consistent, including:

- `UserRole`
- `ProgramType`
- `ApplicationStatus`
- `ProposalStatus`
- `RegistrationStatus`
- `ThesisStatus`
- `VivaOutcome`
- `AcademicStatus`
- `DocumentType`
- `NotificationEvent`
- `NotificationDeliveryStatus`
- `CorrectionType`
- `PanelEvaluationOutcome`

This makes lifecycle rules explicit both in the UI and in backend logic.

---

## 10. Document Handling

Document workflows are a major part of this project.

The system handles:

- application attachments
- proposal files
- progress-report documents
- thesis files
- correction documents
- version tracking
- current-version flags
- storage metadata

Supabase Storage stores the physical files, while the database tracks metadata such as:

- file name
- storage path
- MIME type
- document type
- version
- ownership and workflow relation

---

## 11. Validation Strategy

One of the strongest parts of this codebase is its **shared validation strategy**.

Validation is handled mainly with **Zod**, which means:

- invalid input can be rejected in the browser early
- the server still enforces the exact same rules
- core workflows stay consistent end-to-end

Shared validation currently covers areas such as:

- login
- public applications
- proposals
- proposal evaluations
- progress reports
- theses
- corrections
- viva scheduling

---

## 12. Security and Access Control

Security is handled in several layers.

### Authentication

Firebase provides:

- identity verification
- role-aware user context
- token and session support

### Route Protection

Dashboard routes and API endpoints are protected with authenticated context and role checks.

### Role-Based Access

Examples include:

- administrators can access admin-only operations
- supervisors can only review assigned students
- examiners only see relevant examination workspaces
- students only access their own lifecycle data

### Session Handling

The project also includes session activity tracking and cookie-based authenticated server access.

---

## 13. Monitoring and Reliability

The codebase includes support for Sentry and operational logging.

That includes:

- Sentry configuration files
- monitoring helpers
- notification logs
- reporting and oversight endpoints

This matters because the platform is not just transactional. It also needs auditability and operational follow-up.

---

## 14. Testing Coverage

The repository includes strong automated testing support.

Testing tools include:

- `Vitest`
- `@testing-library/react`
- `@testing-library/user-event`
- `jsdom`
- `Playwright`

Coverage spans multiple domains such as:

- authentication
- applications
- proposals
- dashboards
- registrations
- progress reports
- theses
- vivas
- storage helpers

This reflects a solid quality and regression-prevention mindset.

---

## 15. Runtime Characteristics

This is a **Node-backed full-stack application**, not a static site.

It depends on:

- a running Supabase Postgres database
- Firebase configuration
- Supabase storage credentials
- email credentials
- optional monitoring credentials

Typical development flow:

1. install dependencies
2. generate the Prisma client
3. run migrations
4. configure environment variables
5. start the Next.js dev server

---

## 16. Project Strengths

From the structure of the repository, the strongest qualities of the project are:

- clear role-based architecture
- shared validation across frontend and backend
- strong workflow coverage across the full postgraduate lifecycle
- integrated document handling
- practical administrative tooling
- automated test coverage across major features
- full-stack implementation in one framework

---

## 17. In One Sentence

This project is a **role-based full-stack Department M.Phil./Ph.D. lifecycle
system** built with Next.js, Prisma, Firebase, and Supabase to manage application,
fixed milestones, examination, completion, confirmed graduation, and archive as
separate controlled states.

---

## 18. Best Files to Read First

For someone new to the repository, the best entry points are:

- `README.md`
- `package.json`
- `prisma/schema.prisma`
- `src/app/layout.tsx`
- `src/components/dashboard/dashboard-role-layout.tsx`
- `src/app/api/*`
- `src/lib/applications/*`
- `src/lib/proposals/*`
- `src/lib/theses/*`

These files give the fastest understanding of:

- what the system does
- how the app is structured
- what the major workflows are
- how the data model supports them

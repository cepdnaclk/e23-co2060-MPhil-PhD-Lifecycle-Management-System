---
layout: home
permalink: index.html

repository-name: e23-co2060-MPhil-PhD-Lifecycle-Management-System
title: Postgraduate Lifecycle Management System
---

# Postgraduate Lifecycle Management System

#### Team

- E/23/442 - D.K.G.P.C.B. Wijerathne - e23442@eng.pdn.ac.lk
- E/23/118 - D.A.A. Gunawardana - e23118@eng.pdn.ac.lk
- E/23/178 - S.N.R. Kodituwakku - e23178@eng.pdn.ac.lk
- E/23/023 - M.N.P.V. Aththanayake - e23023@eng.pdn.ac.lk

#### Supervisor

- Dr. Upul Jayasinghe - upul@eng.pdn.ac.lk

#### Table of content

1. [Abstract](#abstract)
2. [Related works](#related-works)
3. [Methodology](#methodology)
4. [System Architecture and Implementation](#system-architecture-and-implementation)
5. [Results and Analysis](#results-and-analysis)
6. [Conclusion](#conclusion)
7. [Publications and Documentation](#publications-and-documentation)
8. [Links](#links)

---

## Abstract

The **Postgraduate Lifecycle Management System (PGLMS)** is a role-based web
platform developed to centralize the academic and administrative activities
associated with postgraduate research programmes. The system supports the
complete lifecycle from public application and admission to registration,
supervisor assignment, proposal submission, ethics documentation, progress
reporting, thesis examination, viva scheduling, corrections, graduation, and
record archival.

The platform provides separate access and workflow support for Students,
Supervisors, Examiners, and Administrators. It combines structured relational
data, secure authentication, private document storage, notifications, email
delivery, and role-specific dashboards in a single system.

## Related works

Postgraduate administration is commonly handled using combinations of paper
forms, spreadsheets, email communication, and separately maintained document
repositories. Although these methods can support individual tasks, they make it
difficult to maintain a consistent view of each student's current academic
state, registration status, submitted documents, assigned reviewers, and
pending actions.

Existing student information systems often focus on course-based registration
and examination records. Research-degree programmes require additional
workflow support for proposals, supervisors, periodic progress reviews, thesis
versions, examiner assignments, vivas, corrections, and long-term archival.
PGLMS addresses this requirement by modelling the postgraduate journey as a
connected lifecycle rather than as a collection of independent forms.

## Methodology

The system was developed using an iterative full-stack software-development
approach.

The main activities included:

1. Identifying the principal users and their responsibilities.
2. Dividing the postgraduate lifecycle into manageable workflow domains.
3. Designing a relational database schema for identities, applications,
   registrations, research records, assignments, documents, and notifications.
4. Implementing role-based APIs and dashboards.
5. Applying runtime validation and authorization before database operations.
6. Integrating authentication, object storage, email, and monitoring services.
7. Testing important service rules and API routes using unit,
   integration-style, component, and browser-level tests.
8. Reviewing the implementation for workflow completeness, security,
   consistency, and deployment readiness.

The system uses status enums and service-level transition rules to represent
the current state of major records such as applications, registrations,
proposals, theses, and maintenance jobs.

## System Architecture and Implementation

The project is implemented as a full-stack **Next.js 14 App Router**
application.

### Technology stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Styling and UI | Tailwind CSS, Radix UI, shadcn components |
| Backend | Next.js Route Handlers |
| Runtime validation | Zod |
| Authentication | Firebase Authentication and Firebase Admin SDK |
| Database | Supabase-hosted PostgreSQL |
| ORM and migrations | Prisma |
| File storage | Supabase Storage |
| Email | Nodemailer with SMTP |
| Client-side data fetching | SWR |
| Monitoring | Sentry |
| Testing | Vitest, Testing Library, jsdom, Playwright |

### High-level architecture

```text
Public Pages and Role-Based Dashboards
                  |
                  v
          Next.js Route Handlers
                  |
                  v
     Authentication and Authorization
                  |
                  v
       Domain and Workflow Services
          /        |         \
         v         v          v
   Prisma ORM   Firebase   Supabase Storage
         |
         v
      PostgreSQL
```

### Main user roles

| Role | Main system responsibilities |
|---|---|
| Student | Submit proposals, progress reports, theses, and corrections; monitor registration and lifecycle status |
| Supervisor | View assigned students and participate in academic monitoring and review |
| Examiner | Access assigned examination records and submit examination-related decisions |
| Administrator | Manage applications, users, assignments, scheduling, decisions, notifications, and finalization |

### Main workflow areas

- Public applications and supporting-document submission
- Application review, admission, and Student account provisioning
- Registration creation, expiry tracking, reminders, and renewal
- Supervisor and examiner assignments
- Proposal, ethics, progress-report, thesis, viva, and correction workflows
- Private document storage and signed downloads
- In-application notifications and email delivery
- Administrative reports, monitoring, and maintenance operations

### Repository structure

```text
src/
  app/          Next.js pages, layouts, and API Route Handlers
  components/   Shared and domain-specific user-interface components
  lib/          Business rules, validation, database access, and integrations
  types/        Shared TypeScript types

prisma/         Prisma schema and database migrations
tests/          Unit, integration-style, component, and E2E tests
docs/           Project documentation and GitHub Pages content
images/         Project images and static assets
```

## Results and Analysis

The implemented system provides a centralized foundation for the major
postgraduate lifecycle records and role-based operations. Important completed
or substantially implemented areas include:

- public application submission;
- application review and admission;
- Student account and initial registration creation;
- role-based authentication and protected API routes;
- proposal, progress-report, thesis, viva, and correction records;
- document metadata and private object-storage integration;
- registration-expiry maintenance and notification support;
- automated unit and integration-style tests;
- production build and Prisma validation support.

The implementation also identified several areas that require further
strengthening before production reliance:

- database-level enforcement of selected lifecycle invariants;
- stronger logical versioning for multi-file academic submissions;
- complete end-to-end review and release workflows;
- live integration testing with Firebase, PostgreSQL, Storage, and SMTP;
- complete deployment, migration, backup, and recovery procedures;
- durable retry and idempotency for notifications and external effects;
- additional accessibility, security, and operational verification.

These findings are recorded in the system audit and progress register in the
repository.

## Conclusion

PGLMS demonstrates how the postgraduate research lifecycle can be represented
as a connected, role-aware information system. The project replaces
disconnected administrative records with a shared platform for applications,
registration, academic milestones, examination, documents, and communication.

The current implementation establishes the primary architecture, relational
data model, authentication model, workflow services, and test foundation.
Further work should focus on completing the remaining governance workflows,
strengthening database constraints and distributed consistency, expanding
real-service end-to-end tests, and establishing a controlled production
deployment process.

## Publications and Documentation

- [Project Overview](https://github.com/cepdnaclk/e23-co2060-MPhil-PhD-Lifecycle-Management-System/blob/main/PROJECT_OVERVIEW.md)
- [Repository README](https://github.com/cepdnaclk/e23-co2060-MPhil-PhD-Lifecycle-Management-System/blob/main/README.md)
- [Workflow Report](./WORKFLOW_REPORT.md)
- [System Audit and Progress Register](./PGLMS_MASTER_SYSTEM_AUDIT_AND_PROGRESS_REGISTER.md)

Add the following links when the files are available:

<!--
1. [Project proposal](./)
2. [Progress presentation](./)
3. [Final report](./)
4. [Final presentation](./)
5. [Research publication](./)
-->

## Links

- [Project Repository](https://github.com/cepdnaclk/e23-co2060-MPhil-PhD-Lifecycle-Management-System)
- [Project Page](https://cepdnaclk.github.io/e23-co2060-MPhil-PhD-Lifecycle-Management-System/)
- [Department of Computer Engineering](https://www.ce.pdn.ac.lk/)
- [Faculty of Engineering, University of Peradeniya](https://eng.pdn.ac.lk/)
- [University of Peradeniya](https://www.pdn.ac.lk/)

# MPhil/PhD Lifecycle Management System

A Next.js postgraduate research lifecycle platform for managing public applications, admissions, registrations, proposals, progress reports, theses, vivas, corrections, and administrative review workflows.

## Overview

The system supports four role-based experiences:

- `Student`: application, registration, proposal submission, progress reports, thesis submission, and correction uploads
- `Supervisor`: assigned student oversight, proposal evaluation, and progress-report sign-off
- `Examiner`: viva workspace and outcome recording
- `Administrator`: user management, application review, viva scheduling, thesis/archive workflows, reporting, and operational oversight

The application uses shared validation rules on both the client and server so the main form flows reject invalid input before submission and still enforce the same constraints at the API/service layer.

## Tech Stack

- `Next.js 14` with the App Router
- `React 18` and `TypeScript`
- `Tailwind CSS`
- `Prisma` with `PostgreSQL`
- `Firebase Auth` and `Firebase Admin SDK`
- `Supabase Storage` for protected document uploads
- `Nodemailer` for SMTP email delivery
- `Zod` for shared input validation
- `Vitest`, `Testing Library`, and `Playwright` for automated testing

## Key Workflows

- Public research programme application form with staged validation and supporting PDF upload
- Secure sign-in with Firebase-backed session cookies and inactivity tracking
- Student proposal versioning and supervisor/admin review
- Student progress-report submission and supervisor sign-off
- Thesis submission, viva scheduling, viva outcome recording, and correction resubmission
- Administrative reporting, notification logging, and role/user management

## Project Structure

```text
src/
  app/
    api/
    apply/
    dashboard/
    login/
  components/
    admin/
    application/
    auth/
    dashboard/
    progress-reports/
    proposals/
    student/
  lib/
    admin/
    applications/
    auth/
    firebase/
    progress-reports/
    proposals/
    theses/
    validation/
    vivas/
  types/

prisma/
tests/
```

## Environment Setup

Create a local `.env` file with the values required by your environment.

Core database and storage variables:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET` if you expose the bucket name to the client

Firebase client/admin variables:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Email and session variables:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `SESSION_COOKIE_NAME`
- `SESSION_ACTIVITY_COOKIE_NAME`
- `APP_BASE_URL`

Optional monitoring variables:

- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN`

## Getting Started

Install dependencies:

```bash
npm install
```

Generate the Prisma client:

```bash
npx prisma generate
```

Run local migrations:

```bash
npx prisma migrate dev
```

Start the development server:

```bash
npm run dev
```

The app runs locally at `http://localhost:3000`.

## Available Scripts

- `npm run dev` - start the development server
- `npm run build` - create a production build
- `npm run start` - start the production server
- `npm run lint` - run ESLint
- `npm test` - run the Vitest suite
- `npm run test:unit` - run unit tests only
- `npm run test:integration` - run integration tests only
- `npm run prisma:generate` - generate the Prisma client
- `npm run prisma:migrate` - create and apply a development migration

## Validation

Shared `Zod` schemas are used across major user-facing flows so browser-side validation and server-side validation stay aligned. Current shared validation coverage includes:

- sign-in credentials and session/auth claim payloads
- public application submission and supporting document rules
- proposal upload, submission, and evaluation flows
- progress-report submission
- thesis submission and thesis correction uploads
- viva scheduling payloads

## Testing

Vitest covers unit and integration behavior across authentication, applications, proposals, registrations, progress reports, theses, vivas, dashboards, and storage helpers.

Verified on `May 2, 2026`:

- `vitest run tests/unit tests/integration`
- `72` test files passed
- `221` tests passed

Playwright end-to-end tests live under `tests/e2e` and should be run separately when browser-level flow coverage is needed.

## Notes

- Firebase is used for identity and session verification; document storage is handled through Supabase Storage.
- Several document workflows depend on external services being configured correctly before they will work end-to-end.
- The repository currently includes Sentry configuration files, but production monitoring depends on valid Sentry credentials.
- The application requires a Node-capable host; it is not a static-only deployment target.

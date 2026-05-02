# MPhil/PhD Lifecycle Management System

A Next.js-based lifecycle management platform for handling postgraduate research workflows across students, supervisors, examiners, and administrators.

## Overview

This branch contains the implemented postgraduate lifecycle backlog from the project roadmap, covering:

- project scaffolding with Next.js App Router
- Prisma domain modeling and migration history
- Firebase authentication and role-based access control
- Firebase Storage utilities for protected document handling
- SMTP email integration and notification logging
- administrator user management
- role-specific dashboard home pages
- student application, admission, registration, and profile management
- proposal, progress-report, panel, thesis, viva, correction, archive, reporting, and hardening workflows

## Tech Stack

- Frontend: Next.js 14, React 18, TypeScript
- Styling: Tailwind CSS
- Backend: Next.js Route Handlers
- Database ORM: Prisma
- Database: PostgreSQL
- Authentication: Firebase Auth, Firebase Admin SDK
- File Storage: Firebase Cloud Storage
- Email: Nodemailer (SMTP)
- Testing: Vitest, Testing Library, Playwright

## Project Structure

```text
src/
  app/
    (auth)/
    (dashboard)/
    api/
  components/
    admin/
    auth/
    dashboard/
    ui/
  lib/
    admin/
    dashboard/
    firebase/
    prisma/
  types/

prisma/
tests/
```

## Implementation Status

Implemented locally against the documented backlog file:

- `PB-001` to `PB-006`
- `PB-010` to `PB-012`
- `PB-020` to `PB-023`
- `PB-030` to `PB-032`
- `PB-040` to `PB-046`
- `PB-050` to `PB-053`
- `PB-060`
- `PB-070` to `PB-071`
- `PB-080` to `PB-081`
- `PB-090` to `PB-092`

Infrastructure completion included in this branch:

- initial Prisma migration history created for the current schema
- Sentry package and Next.js monitoring configuration wired for server, edge, and browser contexts
- environment-variable documentation updated for session tracking and monitoring

## Environment Variables

Create a local `.env` file based on `.env.example`.

Important variables include:

- `DATABASE_URL`
- Firebase client credentials
- Firebase admin credentials
- `FIREBASE_STORAGE_BUCKET`:
  `your-project-id.firebasestorage.app` for newer Firebase default buckets or
  `your-project-id.appspot.com` for older ones. Do not include `gs://`.
- SMTP credentials
- `SESSION_COOKIE_NAME`
- `SESSION_ACTIVITY_COOKIE_NAME`
- `APP_BASE_URL`
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

Generate Prisma client:

```bash
npx prisma generate
```

Run database migrations:

```bash
npx prisma migrate dev
```

Start the development server:

```bash
npm run dev
```

Open the app at `http://localhost:3000`.

## Available Scripts

- `npm run dev` - start the development server
- `npm run build` - create a production build
- `npm run start` - start the production server
- `npm run lint` - run linting
- `npm test` - run Vitest
- `npm run test:unit` - run unit tests
- `npm run test:integration` - run integration tests
- `npm run prisma:generate` - generate Prisma client
- `npm run prisma:migrate` - run Prisma migrations

## Notes

- Firebase, PostgreSQL, SMTP, and Sentry must be configured before all production integrations work end-to-end.
- Some tests and runtime flows depend on local database and Firebase setup.
- Sentry is configured to avoid logging default PII and to redact cookies and authorization headers before capture.
- Playwright end-to-end tests should be run separately from Vitest.
- The README status reflects the code and automated test coverage in this branch relative to the product backlog source.
- GitHub Pages can only serve static files for this repository. The application itself requires a Node-capable host because it uses Next.js route handlers, server-side authentication, Prisma, and external services.

## Branch

This README was added on the `alternate` branch.

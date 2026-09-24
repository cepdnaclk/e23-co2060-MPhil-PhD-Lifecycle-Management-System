# Current Version Audit — 24 September 2026

## Executive verdict

The current version is healthy at the build, static-analysis, and public-smoke-test level, but it is **not yet ready for an uncontrolled populated-production deployment**.

- No critical security vulnerability was confirmed.
- The current `main` commit (`7e7017c4db5b47f72b18eb0c28b9624066590a2f`) has green required GitHub checks, CodeQL, secret scanning, and database-migration CI.
- Local lint, type-check, production build, Prisma validation, split unit/integration tests, and public Playwright checks pass.
- Six high-priority release risks were present at audit time. They concern migration enforcement, scheduled maintenance, production configuration validation, an admission gate bypass, failed applicant revision email delivery, and race-prone decision transitions. See the post-audit status for fixes made afterward.
- The production dependency graph has no known npm advisories. The development graph has two records for one moderate Vitest advisory.

The recommended decision is: **continue UI work only after the high-priority workflow and operations issues are either fixed or explicitly accepted with compensating controls. Do not run the current direct migration command against a populated production database.**

## Scope and method

This was a read-only audit of application source, API routes, lifecycle workflows, Prisma schema and migrations, authentication and authorization, upload/download controls, CI/CD, Vercel-oriented operations, observability, tests, dependencies, and project documentation.

The audit combined:

- independent security/privacy, workflow/data-integrity, and delivery/operations reviews;
- local execution of the release gates;
- read-only inspection of the current GitHub checks, branch protection, CodeQL, Dependabot, and secret-scanning state;
- targeted tests for authentication, request security, capabilities, uploads, document access, and workflow behavior.

No application source or configuration was changed during the audit.

## High-priority findings

### H1 — Destructive migration blockers do not block deployment

**Evidence:** `prisma/migration-policy.json:4-57` marks eleven migrations as `productionDeploymentBlocked`. `scripts/check-migration-policy.mjs:80-111` treats the presence of those flags as a warning and exits successfully. `package.json:15` still exposes direct `prisma migrate deploy`, and `.github/workflows/ci.yml:127` invokes it on an empty CI database.

**Impact:** an operator can apply all pending destructive migrations to a populated database even though the policy describes them as blocked. A smooth application build or empty-database migration run does not prove populated-data safety.

**Required action:** replace the production deploy command with a target-aware wrapper that inspects the target migration ledger and refuses pending blocked migrations unless a specific reviewed release artifact approves them. Preserve a separate, explicit approved-release path and test the refusal behavior.

### H2 — Maintenance and outbox recovery are not wired to native Vercel Cron

**Evidence:** `src/app/api/cron/maintenance/route.ts:32-97` exposes only `POST` and requires custom HMAC headers. No `vercel.json` scheduler is committed. The route performs outbox recovery and other maintenance at `route.ts:125-145`, while `src/lib/outbox/service.ts:229-233` relies on scheduled recovery.

**Impact:** native Vercel Cron uses a configured path with `GET` and `Authorization: Bearer $CRON_SECRET`; the current endpoint would receive neither the expected method nor headers. Without an independently provisioned signer, failed notifications, stale uploads, and overdue transitions are not recovered automatically.

**Required action:** add a Vercel-compatible authenticated `GET` adapter and committed cron declaration, or explicitly provision and document an external signed `POST` scheduler. Add last-success, dead-letter, and synthetic-runtime monitoring.

### H3 — Production-critical configuration is validated only on first use

**Evidence:** the CI production build supplies only `DATABASE_URL` (`.github/workflows/ci.yml:73-76`). Firebase Admin validates lazily in `src/lib/firebase/admin.ts:28-54`; Supabase validates lazily in `src/lib/storage.ts:48-78`; public Firebase configuration is assembled without a required-field contract in `src/lib/firebase/client.ts:14-44`. `.env.example:14-73` contains multiple runtime-critical services.

**Impact:** a Vercel build can be green while authentication, uploads, email, malware scanning, scheduled maintenance, or monitoring fails at runtime. Missing `NEXT_PUBLIC_*` values are baked into the client artifact.

**Required action:** add a typed environment contract, validate public/bundled values during build, and run a non-destructive deployment smoke check for server-side integrations before promotion.

### H4 — HOD admission bypasses proposal-review completion

**Evidence:** `src/lib/applications/department-workflow.ts:299-336` loads proposal reviewer assignments but proceeds to the HOD decision without validating that a current-version Examiner review exists or is complete. This conflicts with `docs/DEPARTMENT_PGLMS_V1_REQUIREMENTS.md:40` and `docs/DEPARTMENT_PGLMS_V1_WORKFLOWS.md:14`. The same workflow permits a `SUPERVISOR` reviewer at `department-workflow.ts:148`, whereas `docs/DEPARTMENT_PGLMS_V1_PERMISSION_MATRIX.md:15` grants submission to assigned Examiners.

**Impact:** after supervisor consent, an HOD can approve an application with zero or unfinished proposal reviews, and the Administrator can execute admission.

**Required action:** require at least one current-version Examiner assignment and completion of all required assignments before HOD admission decisions. Align the allowed reviewer role with the approved matrix and add negative gate tests.

### H5 — Applicant proposal-revision emails deterministically fail

**Evidence:** `src/lib/applications/department-workflow.ts:365` enqueues a guest applicant email without `recipientId` or `notificationEvent`. `src/lib/outbox/service.ts:128` rejects every email lacking those fields.

**Impact:** a requested revision is recorded, but the applicant never receives the protected revision link. The message retries and eventually dead-letters, blocking the public applicant workflow.

**Required action:** support external/guest recipients explicitly in the outbox and notification log, or introduce a durable applicant-recipient model. Add producer-to-consumer contract tests for every queued email type.

### H6 — Several decision transitions are vulnerable to last-writer-wins races

**Evidence:** admission reads `PENDING` and later updates unconditionally (`src/lib/applications/department-workflow.ts:298-336`); examiner confirmation follows the same pattern (`src/lib/examination/department-workflow.ts:440-481`); and progress approval/return reads `SUBMITTED` then updates unconditionally (`src/lib/progress-reports/milestone-workflow.ts:416-465`). Conflicting decision values generate different audit event keys.

**Impact:** two browser sessions can submit opposing decisions after reading the same old state. Both actions can be audited as valid while the final record reflects only the last update. Related records can become inconsistent.

**Required action:** use `src/lib/prisma/transactions.ts:7` serializable retry support or conditional updates that include the expected prior state and assert that exactly one row changed. Add real-database concurrency tests.

## Medium-priority findings

### M1 — Session inactivity is asserted by an unsigned client cookie

`src/lib/security/session.ts:12-35`, `src/lib/firebase/auth.ts:64-75,129-164`, and `src/app/api/auth/session/route.ts:84-89,206-229` trust a client-supplied timestamp. An attacker who obtains the seven-day session cookie can supply a fresh activity cookie in a raw request and bypass the intended 30-minute inactivity timeout.

Store activity server-side against an opaque session identifier, or authenticate and bind the activity value to the session identity. Add a test proving a fabricated activity cookie cannot revive a stale session.

### M2 — CSP is report-only, allows inline scripts, and has no report destination

`next.config.mjs:4-24` emits only `Content-Security-Policy-Report-Only` and includes `'unsafe-inline'`. No `report-to` or `report-uri` is configured. The current source contains no obvious React raw-HTML or dynamic-code sink, which reduces immediate likelihood, but the policy neither blocks nor centrally reports future injection.

Add reporting, eliminate violations, then promote to an enforcing nonce/hash-based policy and remove production inline-script allowances where possible.

### M3 — Proposal-revision bearer capability can leak through URL telemetry

`src/lib/applications/department-workflow.ts:29-33` creates `/apply/revise?...&token=...`; `src/app/apply/revise/page.tsx:8-18` reads it from the URL. Sentry redaction in `instrumentation-client.ts:4-20` removes sensitive headers but does not scrub request or breadcrumb query strings.

Exchange a short-lived link code through `POST` into a narrowly scoped HttpOnly cookie, or at minimum remove the query immediately after capture and scrub sensitive query parameters in all telemetry hooks.

### M4 — Required CI browser coverage is almost entirely anonymous

`package.json:26` excludes `@external` tests. Authenticated accessibility, role login, mobile navigation, and lifecycle tests are tagged external, while `.github/workflows/ci.yml:166-172` invokes only the excluding command. Of seventeen discovered Playwright tests, only the two public `/apply` checks run in required CI.

Add a protected scheduled or pre-release environment job for authenticated role and integration tests, with at least one non-destructive authenticated smoke required for releases.

### M5 — Handled API failures frequently bypass Sentry

The central capture helper in `src/lib/http/errors.ts:5-23` is used by only a small minority of API routes. Representative routes catch and translate failures without capture, including `src/app/api/student/thesis-readiness/route.ts:20-30` and `src/app/api/supervisor/thesis-readiness/[id]/certify/route.ts:22-34`; others only log to the console.

Centralize route error capture/translation and test that unexpected failures are reported with route, actor, and operation tags.

### M6 — Same-day maintenance failures cannot be retried

`prisma/schema.prisma:1368` makes `(jobName, runKey)` unique. `src/app/api/cron/maintenance/route.ts:103` always inserts a new run and returns conflict for any duplicate, while failed rows remain claimed at `route.ts:151`.

Separate logical runs from attempts, or safely reclaim failed and stale running attempts with leases and bounded retry counts.

### M7 — Application proposal “current version” is not a database invariant

`prisma/schema.prisma:477-493` has a normal index rather than a partial unique index for `isCurrent`. Consumers such as `src/lib/applications/department-workflow.ts:125` take one matching row without detecting duplicates.

Reconcile existing rows and add a partial unique index on `applicationId WHERE isCurrent = true`, matching the stronger thesis/research-proposal invariants.

### M8 — Email delivery is at-least-once, not deduplicated end-to-end

The worker sends at `src/lib/outbox/service.ts:135` and marks success only at `outbox/service.ts:157`; stale leases are requeued at `outbox/service.ts:269`. `src/lib/email.ts:181` provides no stable provider idempotency key or deterministic `Message-ID`.

Persist a deterministic delivery identity before sending and use provider idempotency if available; otherwise use a stable message ID and document the remaining semantics.

### M9 — Development dependency advisory remains open

`vitest@3.2.7` and `@vitest/mocker` are affected by GHSA-82fw-gwwq-j7x9, a moderate development-server file-read issue. Production dependencies are clean. CI intentionally fails only on high/critical advisories.

Upgrade Vitest to a compatible patched release after checking breaking changes. Until then, keep the test/dev server bound to trusted local or CI interfaces and do not expose it to untrusted networks.

### M10 — Documentation and quality metrics have drifted

`README.md:110-124,177-193` describes Next 14, React 18, Node 18, and `npm install`, while `package.json` specifies Next 16.3.5, React 19.2.7, Node 24.15.x, and a locked npm toolchain. The operations dependency baseline is also stale. CI has no coverage or performance budget.

Update/version-stamp operational documentation, prefer `npm ci`, and add changed-code plus critical-domain coverage thresholds. Add browser bundle and runtime performance budgets appropriate to the upload/scanning flows.

## Verification record

| Check | Result |
|---|---|
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; 89 routes/pages generated |
| `npm run test:unit` | 68 files, 260 tests passed |
| `npm run test:integration` | 29 files passed, 1 skipped; 93 tests passed, 1 skipped |
| Combined `npm test` | 352 passed, 1 skipped, 1 timed out; timed-out test passed alone in 450 ms |
| `npm run test:e2e` | 2 public Chromium checks passed |
| Focused security tests | 7 files, 36 tests passed |
| Focused workflow tests | 5 files, 20 tests passed |
| `npm run prisma:validate` | Passed |
| `npm run prisma:migrate:check` | Passed policy integrity; warned about 11 production blockers |
| `npm run audit:production` | 0 vulnerabilities |
| `npm run audit:all` | 2 moderate records for the Vitest advisory |
| Current GitHub required checks | Quality, database migrations, browser smoke, secret scan, and CodeQL passed |
| GitHub code-scanning alerts | 0 open |
| GitHub secret-scanning alerts | 0 open |
| GitHub Dependabot alerts | 2 open records for the same moderate Vitest advisory |

The combined Vitest timeout occurred in `tests/unit/notification-log.test.ts:191` under simultaneous full-suite load. The CI-equivalent split unit and integration commands both passed, and the test passed immediately in isolation. Track this as flakiness, not as evidence of an application defect.

## Confirmed strengths

- Centralized authentication enforces active local users, database roles, Firebase claims, role allowlists, same-origin cookie mutations, and double-submit CSRF.
- Session cookies are Secure, HttpOnly, and SameSite=Lax.
- Document access is resource-scoped; signed download URLs are short-lived; access events are append-only.
- Public draft/revision capabilities are random, hash-only at rest, expiring, constant-time checked, and rate-limited.
- Uploads are staged and verified for signature, size, checksum, ZIP safety, and malware-scan configuration.
- Lifecycle audit immutability is enforced by a database trigger.
- Core version creation, corrections, ethics, and admission execution generally use serializable transactions, manifest binding, verified uploads, and atomic audit/outbox writes.
- Completion gates cover milestones, ethics, current thesis evidence, viva outcome, and corrections.
- The outbox has unique event keys, atomic claiming, exponential retry, stale-lease recovery, dead-lettering, and an administrative retry surface.
- CI uses locked installs, minimal permissions, immutable action SHAs, disposable PostgreSQL, schema-drift detection, CodeQL, full-history secret scanning, and uploaded Playwright diagnostics.
- `main` branch protection requires all five primary checks, is strict, blocks force-push/deletion, and applies to administrators.
- Sentry disables default PII, strips authentication/cookie headers, disables public production source maps, and deletes maps after upload.

## Recommended remediation order

1. Fix the applicant revision email contract and restore an end-to-end applicant revision path.
2. Reinstate proposal-review gates and role constraints before HOD admission.
3. Make conflicting decisions atomic and add database-backed race tests.
4. Replace the migration deployment command with an actual populated-target block and complete the required rehearsal/approval evidence.
5. Wire and monitor scheduled maintenance/outbox recovery in the real deployment environment.
6. Add environment-contract validation and a post-deploy integration smoke.
7. Correct session inactivity enforcement and sensitive URL telemetry.
8. Expand authenticated release testing and centralize handled-error reporting.
9. Enforce CSP after a measured reporting period.
10. Upgrade Vitest, refresh documentation, and introduce coverage/performance budgets.

## Post-audit remediation status

The `codex/pre-review-audit-fixes` branch addresses the two immediate pre-review workflow blockers:

- **H4 fixed:** proposal reviewer assignment and submission are restricted to active Examiners; the server now requires at least one current-version review and requires every assigned review to be complete before an HOD decision. The HOD interface exposes review readiness and disables premature decisions.
- **H5 fixed:** the outbox now supports durable email delivery to external applicants without requiring an internal `User` record. User-scoped notification logs remain limited to registered users, while guest delivery remains recorded by the outbox and delivery-attempt tables.

Regression coverage was added at the domain service, outbox/email consumer, and HOD interface layers. The branch passed lint, type-check, 267 unit tests, 93 integration tests with one intentional skip, and a production build.

## Not verified by this audit

The following require production or protected-staging access and remain separate evidence items:

- actual Vercel environment values, function limits, scheduler state, and deployed response headers;
- Firebase session revocation and role behavior against the real tenant;
- Supabase bucket privacy, signed URL behavior, retention, and restore procedures;
- live SMTP, malware scanner, outbox scheduler, and dead-letter alerts;
- Sentry ingest, release mapping, alert routing, and private source-map quality;
- production database/storage backup policy, recovery-point/recovery-time objectives, and restore drill;
- authenticated cross-role browser journeys, load behavior, and Web Vitals.

These should be collected in a protected staging rehearsal before declaring a populated-production release ready.

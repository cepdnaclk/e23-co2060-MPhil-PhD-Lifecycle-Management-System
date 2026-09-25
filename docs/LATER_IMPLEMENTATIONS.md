# Later Implementations

**Last reviewed:** 25 September 2026  
**Purpose:** Track work deliberately deferred from the current UI and public-application upload changes.

## Required before populated production deployment

- [ ] **Provision private malware scanning.** Deploy or approve an authenticated
  HTTPS scanner, then configure `MALWARE_SCANNER_URL` and
  `MALWARE_SCANNER_TOKEN` in Vercel Preview and Production. The scanner must
  accept raw file bytes and return `{ "clean": true }`. Do not send student or
  research documents to a public multi-engine service without an approved data
  processing decision. The temporary `ALLOW_UNSCANNED_UPLOADS=true` demo mode
  must then be removed, and all records with `malwareScanStatus=PENDING` must
  be scanned or quarantined before they are treated as safe. Without either a
  scanner or the explicit demo mode, production uploads return `503`.
- [ ] **Validate the direct-upload flow in protected staging.** Test valid PDF
  and ZIP files below and above Vercel's 4.5 MB Function payload boundary,
  invalid signatures, unsafe archives, scanner rejection and timeout, deletion,
  draft recovery, and final application submission against an isolated private
  Supabase bucket.
- [ ] **Enforce migration deployment blockers.** Replace direct production
  `prisma migrate deploy` usage with a target-aware gate that refuses pending
  `productionDeploymentBlocked` migrations unless a reviewed release approval
  is present. Complete the populated-data rehearsal before deployment.
- [ ] **Schedule and monitor maintenance.** Add a Vercel-compatible Cron `GET`
  adapter and committed schedule, or document and provision the existing signed
  external `POST` scheduler. Monitor last success, stale uploads, and dead-letter
  outbox records.
- [ ] **Validate production configuration before promotion.** Add a typed
  environment contract and a non-destructive deployment smoke test covering
  Firebase, Supabase, SMTP, scanner, cron authentication, Sentry, and required
  public client variables.
- [ ] **Make decision transitions concurrency-safe.** Replace read-then-update
  HOD admission, examiner confirmation, and progress decisions with conditional
  state updates or serializable retry transactions. Add real-database race
  tests proving that conflicting decisions cannot both succeed.

## Security and reliability hardening

- [ ] Store inactivity state server-side or cryptographically bind it to the
  authenticated session so a fabricated activity cookie cannot extend a stolen
  session.
- [ ] Exchange proposal-revision link capabilities into a narrowly scoped
  HttpOnly cookie and scrub sensitive query parameters from telemetry.
- [ ] Reconcile application proposal versions and enforce one current version
  per application with a database partial unique index.
- [ ] Add deterministic email delivery identity/provider idempotency to reduce
  duplicate sends after worker retries.
- [ ] Allow safe retry of failed or stale same-day maintenance attempts.
- [ ] Centralize unexpected API error capture with route, actor, and operation
  context.
- [ ] Collect CSP reports, remove violations, and promote the report-only policy
  to enforcement without unnecessary inline-script allowances.

## Test and maintenance improvements

- [ ] Add authenticated cross-role Playwright journeys to a protected staging
  release gate, including mobile navigation and the complete applicant flow.
- [ ] Add storage, scanner, SMTP, Sentry, backup/restore, and alert-routing
  evidence from protected staging.
- [ ] Upgrade and re-audit Vitest when a compatible patched version is
  available.
- [ ] Add critical-domain coverage thresholds, browser bundle budgets, runtime
  performance budgets, and keep operational documentation version-stamped.

## Completed or currently in progress

- [x] Proposal review completion and Examiner-role gates before HOD admission.
- [x] Durable guest applicant revision-email delivery through the outbox.
- [x] Dashboard shell, loading-state, overview, public-page, login, and
  application-page theme updates.
- [ ] Direct signed application uploads, server verification, and failure
  cleanup are implemented on `codex/fix-application-file-upload`; merge and
  deploy after review and automated checks.


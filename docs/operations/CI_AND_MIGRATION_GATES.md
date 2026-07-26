# PGLMS CI, Dependency, and Migration Gates

**Document ID:** PGLMS-OPS-002  
**Applies from:** WP-02 working-tree checkpoint, 25 July 2026  
**Owner:** Repository maintainers; project owner/deployer approval remains required  
**Purpose:** Define the repeatable quality, dependency, browser, database, and deployment controls introduced by WP-02.

## 1. Supported baseline

| Area | Supported baseline |
|---|---|
| Runtime | Node.js `24.15.0`, constrained to major 24 by `package.json`; npm `11.12.1` |
| Framework | Next.js `16.2.11`, React/React DOM `19.2.7` |
| Authentication/services | Firebase `12.16.0`, Firebase Admin `14.2.0`, Supabase JS `2.105.x` |
| Email/monitoring | Nodemailer `9.0.3`, Sentry for Next.js `10.66.0` |
| Test/tooling | Vitest `3.2.7`, Playwright `1.61.1`, ESLint `9.39.5`, TypeScript `5.8.3` |
| Database tooling | Prisma Client/CLI `5.22.0`; CI PostgreSQL `16.4` |
| Locking | `package-lock.json`, `.nvmrc`, `engines`, and `packageManager` are authoritative |

The repository uses webpack for `dev` and `build` while the current Sentry and styling integration is validated. A later Turbopack change must be treated as a separate, tested change.

## 2. Required local checks

Run these from a clean checkout before requesting review:

```text
npm ci --no-audit --no-fund
npm run prisma:generate
npm run prisma:validate
npm run prisma:migrate:check
npm run typecheck
npm run lint
npm test
npm run audit:production
npm run audit:all
npm run build
npm run test:e2e
```

`npm test` runs the unit and mocked integration suites. The real database test is intentionally skipped unless a safe `TEST_DATABASE_URL` is supplied. `npm run test:e2e` runs the public Chromium and accessibility smoke set; tests tagged `@external` require isolated Firebase, Supabase, SMTP, and authenticated test accounts and are run separately with `npm run test:e2e:external`.

## 3. Required hosted checks

Configure branch protection for `main` so changes cannot merge until these exact checks pass:

| Workflow | Required check | What it blocks |
|---|---|---|
| CI | `CI / Quality` | Unlocked install, invalid Prisma schema/policy, type/lint/test failure, high/critical production or development advisory, or failed production build |
| CI | `CI / Database migrations` | Migration failure, schema drift, or failed real-PostgreSQL identity-link test |
| CI | `CI / Browser smoke` | Broken public application path or serious/critical automated accessibility finding |
| CI | `CI / Secret scan` | A verified secret detected in repository history |
| CodeQL | `CodeQL / Analyze JavaScript and TypeScript` | New JavaScript/TypeScript SAST finding under the repository's configured protection rule |

Also enable GitHub secret scanning, push protection, Dependabot alerts, and Dependabot security updates in repository settings. The checked-in Dependabot configuration opens weekly npm and GitHub Actions updates. Workflow actions are pinned to immutable commit SHAs.

Repository settings are not represented by source files. WP-02 therefore remains locally implemented, not fully verified, until the project owner records branch-protection and first hosted-run evidence.

## 4. Dependency security policy

- Production and complete dependency audits reject any high or critical advisory.
- Moderate findings require a recorded dependency path, reachability assessment, owner, and review date; they are not silently treated as resolved.
- Do not use `npm audit fix --force` as an automated remediation step because it can install breaking or older direct dependencies.
- Review all `overrides` after each direct dependency upgrade and remove them when the upstream dependency graph carries a compatible patch.

### Current accepted residuals

Reviewed on 25 July 2026; review again by 25 August 2026 or immediately when an upstream patch is released.

| Scope | Count | Dependency path | Current assessment and action |
|---|---:|---|---|
| Production | 6 moderate | `firebase-admin` → Google Cloud Storage/request clients → `uuid` | The vulnerable UUID buffer API is transitive; the application does not call it directly. Track Firebase Admin/Google Cloud releases and retest before removing the exception. |
| Development only | 3 moderate | `shadcn` → MCP SDK → Hono Node adapter | The affected static-serving adapter is installed for developer tooling and is not part of the deployed application. Update when a compatible `shadcn` graph is available. |

The lockfile currently overrides vulnerable transitive versions of `minimatch`, `postcss`, Next.js's optional `sharp`, and a Firebase Admin Firestore cleanup utility. Each override has passed clean install, strict lint, type checking, tests, and production build.

## 5. Test environment safety

- `.env.example` contains placeholders only; never copy real credentials into tracked files.
- A database integration run must use `TEST_DATABASE_URL`, not the development or production `DATABASE_URL`.
- The database name must contain `test` or `ci`.
- A non-local database host is rejected unless `ALLOW_REMOTE_TEST_DATABASE=true` is deliberately set for an isolated test environment.
- CI uses a disposable PostgreSQL service. External E2E suites must likewise use isolated, resettable service projects and non-production recipients.

## 6. Migration policy

`npm run prisma:migrate:check` scans every Prisma SQL migration for destructive statements. A new destructive migration fails unless it has an explicit reviewed entry and immutable checksum in `prisma/migration-policy.json`.

The inherited migration `20260709090000_lifecycle_examiner_reviews_and_multi_uploads` contains 21 destructive statements. Its checksum is pinned and `productionDeploymentBlocked` must remain `true`. Empty-database CI is allowed to prove that the migration sequence is syntactically executable, but this is not authorization to apply it to populated data.

Before any populated-environment deployment:

1. Inventory the affected production rows and columns.
2. Replace the destructive operation with an approved expand/backfill/verify/cutover plan, or prove that the affected data is disposable through a signed decision.
3. Rehearse on a sanitized, current-schema copy of production.
4. Record row counts, invariant checks, timing, backup identifier, restore timing, and named approval.
5. Update the policy record only after preservation and recovery evidence is accepted.

## 7. Deployment and recovery sequence

1. Confirm all required hosted checks pass for the exact commit.
2. Create and verify a restorable database backup; record the backup identifier and expected RPO/RTO.
3. Rehearse the exact migration and application artifact on an isolated production-like copy.
4. Schedule a maintenance window if locking, backfill duration, or compatibility requires it.
5. Deploy the exact previously tested application artifact.
6. Run `npm run prisma:migrate:deploy`; never use `prisma migrate dev` in a deployed environment.
7. Confirm `npm run prisma:migrate:status`, application health, authentication, role access, uploads/downloads, notifications, and scheduled-job behavior.
8. Monitor errors, delivery failures, and database performance through the agreed observation window.

Application rollback uses the retained prior artifact and lockfile only when it remains schema-compatible. Prisma has no automatic down-migration guarantee. If a migration corrupts or removes data, recover from the verified backup or execute an approved roll-forward repair; do not improvise a destructive reversal.

## 8. Populated migration rehearsal addendum — 26 July 2026

The configured populated development database was cloned into a disposable
local PostgreSQL instance without modifying the shared database. All 24
application tables and 176 rows were copied with table-by-table count
verification. The first pending Department V1 migration initially failed
because legacy ethics-review columns had been manually reintroduced after the
July lifecycle migration.

Two paired, production-blocked migrations now preserve those legacy values
before the Department schema change and reconcile them into the staged ethics
workflow afterward:

- `20260726135000_preserve_legacy_ethics_state`
- `20260726232000_reconcile_legacy_ethics_state`

The populated clone then applied every pending migration with zero schema
drift, no unresolved document-migration issues, and no loss of users,
applications, students, documents, ethics records, progress reports,
proposals, theses, or vivas. The two legacy submitted ethics records became
`REQUIRED`, `PENDING`, and `SUPERVISOR_RECOMMENDATION`; the temporary
reconciliation table was removed.

The database-only migration `20260430160021_test` was recovered byte-for-byte
from Git history and archived under `docs/operations/recovered-migrations`.
Its checksum matches the populated database ledger, but it must not be restored
to the active Prisma migration directory because it duplicates the active
`20260501173000_backlog_complete_init` baseline and breaks empty-database
deployment. The guarded ledger-only repair and approval sequence are documented
in `docs/operations/MIGRATION_HISTORY_RECONCILIATION.md`.

A separate empty database successfully applied all 16 active migrations,
reported an up-to-date migration status, and produced zero schema drift. This
rehearsal is evidence for review, not authorization to migrate the shared
database; backup, ledger reconciliation approval, production-blocker review,
and a maintenance/rollback or roll-forward decision remain mandatory.

### Final conformance rehearsal — 27 July 2026

The final 17-migration repository state was rehearsed against the protected
pre-Department-V1 populated backup in disposable local PostgreSQL 15. The
guarded ledger reconciliation and all 14 pending migrations succeeded. Core
record counts were preserved, every targeted final-conformance invariant
reported zero violations, migration status was current, and schema drift was
zero.

Separate pre- and post-migration PostgreSQL 15 archives were checksum-recorded
and restored into empty local databases. The restored pre-change database
reproduced the legacy 25-table state, while the restored post-change database
reproduced the 49-table Department V1 state and again passed migration status
and drift checks. Only aggregate evidence was recorded and the shared database
was not accessed.

The full sanitized report is
`docs/operations/DEPARTMENT_V1_POPULATED_REHEARSAL_20260727.md`. Production
blockers remain in force until the project owner accepts the evidence, confirms
the target-specific inventory and recovery plan, and authorizes deployment.

## 9. WP-02 exit evidence

The local checkpoint on 25 July 2026 produced:

- clean locked install;
- strict ESLint and explicit TypeScript checks;
- 81 Vitest files / 263 tests passed, with one database test skipped in the ordinary no-test-database run;
- the same database test passed against disposable PostgreSQL after all four migrations;
- empty-database migration application, current status, and zero schema drift;
- 67-page Next.js production build;
- two Chromium browser smoke tests, including no serious/critical axe finding on the public application page;
- zero critical/high audit findings, with nine documented moderate findings;
- valid workflow YAML and a passing checksum-enforced migration policy check.

Still required for full verification:

- a green first hosted run and required branch-protection checks;
- GitHub security-setting evidence;
- project-owner approval of the populated-database rehearsal and recovery
  evidence;
- isolated Firebase/Supabase/SMTP authenticated E2E coverage;
- deployment and runtime smoke evidence.

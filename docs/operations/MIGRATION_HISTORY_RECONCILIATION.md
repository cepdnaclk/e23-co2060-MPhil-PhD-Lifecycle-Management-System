# Migration History Reconciliation

## Scope

The populated development database contains an applied migration named
`20260430160021_test` that is absent from the active repository history. Git
history contains its exact SQL, preserved at:

`docs/operations/recovered-migrations/20260430160021_test/migration.sql`

The recovered file has SHA-256:

`eb77a0e534e78ed4765c236435cc33896d172390af0047d1c6c6b912e0e9d5e3`

That checksum matches the applied database ledger entry exactly.

The recovered migration must not be placed inside `prisma/migrations`. It is an
older initial schema that is superseded by
`20260501173000_backlog_complete_init`. Activating both causes an empty database
deployment to fail when the second migration attempts to recreate the same
types and tables.

## Required safeguards

Do not run the ledger repair or populated migrations until all of the following
are recorded:

1. A verified, restorable database backup.
2. A successful rehearsal on an isolated populated copy.
3. Review of every `productionDeploymentBlocked` migration in
   `prisma/migration-policy.json`.
4. An approved maintenance and rollback or roll-forward plan.
5. Confirmation that the target ledger contains exactly one successfully
   applied obsolete migration and exactly one successfully applied superseding
   baseline with the reviewed checksums.

The reconciliation script changes only the matching `_prisma_migrations`
metadata row. It does not alter application tables or records. It is read-only
unless both `--apply` and the exact confirmation environment value are present.

## Dry run

With `DATABASE_URL` pointing to the intended target:

```powershell
npm run database:reconcile-migration-ledger
```

The dry run must report that both reviewed checksums match.

## Approved ledger-only repair

Run only after the safeguards above are satisfied:

```powershell
$env:PGLMS_MIGRATION_LEDGER_REPAIR_CONFIRM="20260430160021_test"
npm run database:reconcile-migration-ledger -- --apply
Remove-Item Env:PGLMS_MIGRATION_LEDGER_REPAIR_CONFIRM
```

Then verify:

```powershell
npm run prisma:migrate:status
```

Do not proceed to `npm run prisma:migrate:deploy` until the populated migration
rehearsal and all production-blocked migration approvals are complete.

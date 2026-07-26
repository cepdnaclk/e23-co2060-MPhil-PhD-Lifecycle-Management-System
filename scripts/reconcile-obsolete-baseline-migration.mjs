import { PrismaClient } from "@prisma/client";

const OBSOLETE_MIGRATION = {
  name: "20260430160021_test",
  checksum: "eb77a0e534e78ed4765c236435cc33896d172390af0047d1c6c6b912e0e9d5e3",
};

const SUPERSEDING_BASELINE = {
  name: "20260501173000_backlog_complete_init",
  checksum: "3d400fdc29672faa27af090d3a6e7ffac537ecc3fd657d66ce75aceca2c8a83c",
};

const CONFIRMATION_VARIABLE = "PGLMS_MIGRATION_LEDGER_REPAIR_CONFIRM";
const prisma = new PrismaClient();

function isSuccessfullyApplied(row) {
  return (
    row.finished_at !== null &&
    row.rolled_back_at === null
  );
}

function assertExpectedHistory(rows) {
  const obsoleteRows = rows.filter(
    (row) => row.migration_name === OBSOLETE_MIGRATION.name,
  );
  const baselineRows = rows.filter(
    (row) =>
      row.migration_name === SUPERSEDING_BASELINE.name &&
      isSuccessfullyApplied(row),
  );

  if (
    baselineRows.length !== 1 ||
    baselineRows[0].checksum !== SUPERSEDING_BASELINE.checksum
  ) {
    throw new Error(
      "The superseding baseline is not recorded exactly once with the reviewed checksum.",
    );
  }

  if (obsoleteRows.length === 0) {
    return { obsoleteRow: null };
  }

  if (
    obsoleteRows.length !== 1 ||
    obsoleteRows[0].checksum !== OBSOLETE_MIGRATION.checksum ||
    !isSuccessfullyApplied(obsoleteRows[0])
  ) {
    throw new Error(
      "The obsolete migration ledger entry does not match the reviewed applied record.",
    );
  }

  return { obsoleteRow: obsoleteRows[0] };
}

async function readRelevantHistory(client) {
  return client.$queryRaw`
    SELECT
      "id",
      "checksum",
      "finished_at",
      "migration_name",
      "rolled_back_at",
      "applied_steps_count"
    FROM "_prisma_migrations"
    WHERE "migration_name" IN (
      ${OBSOLETE_MIGRATION.name},
      ${SUPERSEDING_BASELINE.name}
    )
    ORDER BY "started_at", "id"
  `;
}

async function main() {
  const shouldApply = process.argv.includes("--apply");
  const initialHistory = await readRelevantHistory(prisma);
  const { obsoleteRow } = assertExpectedHistory(initialHistory);

  if (!obsoleteRow) {
    console.log("Migration ledger is already reconciled.");
    return;
  }

  if (!shouldApply) {
    console.log(
      "Dry run passed: the obsolete entry and superseding baseline match the reviewed checksums.",
    );
    return;
  }

  if (
    process.env[CONFIRMATION_VARIABLE] !== OBSOLETE_MIGRATION.name
  ) {
    throw new Error(
      `Set ${CONFIRMATION_VARIABLE}=${OBSOLETE_MIGRATION.name} to authorize the reviewed ledger-only repair.`,
    );
  }

  await prisma.$transaction(async (transaction) => {
    const lockedHistory = await transaction.$queryRaw`
      SELECT
        "id",
        "checksum",
        "finished_at",
        "migration_name",
        "rolled_back_at",
        "applied_steps_count"
      FROM "_prisma_migrations"
      WHERE "migration_name" IN (
        ${OBSOLETE_MIGRATION.name},
        ${SUPERSEDING_BASELINE.name}
      )
      ORDER BY "started_at", "id"
      FOR UPDATE
    `;
    const { obsoleteRow: lockedObsoleteRow } =
      assertExpectedHistory(lockedHistory);

    if (!lockedObsoleteRow) {
      return;
    }

    const deleted = await transaction.$executeRaw`
      DELETE FROM "_prisma_migrations"
      WHERE "id" = ${lockedObsoleteRow.id}
        AND "migration_name" = ${OBSOLETE_MIGRATION.name}
        AND "checksum" = ${OBSOLETE_MIGRATION.checksum}
        AND "finished_at" IS NOT NULL
        AND "rolled_back_at" IS NULL
    `;

    if (deleted !== 1) {
      throw new Error(
        "The ledger changed during reconciliation; no repair was accepted.",
      );
    }
  });

  const finalHistory = await readRelevantHistory(prisma);
  const { obsoleteRow: remainingObsoleteRow } =
    assertExpectedHistory(finalHistory);

  if (remainingObsoleteRow) {
    throw new Error("The obsolete migration ledger entry is still present.");
  }

  console.log(
    "Migration ledger reconciled; application tables and records were not modified.",
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}

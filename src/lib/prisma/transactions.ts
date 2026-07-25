import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma/client";

const MAX_SERIALIZABLE_RETRIES = 5;

export async function withSerializableRetry<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_SERIALIZABLE_RETRIES; attempt += 1) {
    try {
      const runTransaction = prisma.$transaction as unknown as (
        callback: (transaction: Prisma.TransactionClient) => Promise<T>,
        options: {
          isolationLevel: Prisma.TransactionIsolationLevel;
          maxWait: number;
          timeout: number;
        },
      ) => Promise<T>;
      return await runTransaction.call(prisma, operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      });
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002");

      if (!retryable || attempt === MAX_SERIALIZABLE_RETRIES - 1) {
        throw error;
      }
    }
  }

  throw lastError;
}

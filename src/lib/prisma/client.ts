import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

const basePrisma =
  global.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

export const prisma = basePrisma.$extends({
  query: {
    student: {
      findMany({ args, query }) {
        args.where = {
          isArchived: false,
          ...(args.where ?? {}),
        };
        return query(args);
      },
      findFirst({ args, query }) {
        args.where = {
          isArchived: false,
          ...(args.where ?? {}),
        };
        return query(args);
      },
    },
    application: {
      findMany({ args, query }) {
        args.where = {
          isArchived: false,
          ...(args.where ?? {}),
        };
        return query(args);
      },
      findFirst({ args, query }) {
        args.where = {
          isArchived: false,
          ...(args.where ?? {}),
        };
        return query(args);
      },
    },
    thesis: {
      findMany({ args, query }) {
        args.where = {
          isArchived: false,
          ...(args.where ?? {}),
        };
        return query(args);
      },
      findFirst({ args, query }) {
        args.where = {
          isArchived: false,
          ...(args.where ?? {}),
        };
        return query(args);
      },
    },
    progressReport: {
      findMany({ args, query }) {
        args.where = {
          isArchived: false,
          ...(args.where ?? {}),
        };
        return query(args);
      },
      findFirst({ args, query }) {
        args.where = {
          isArchived: false,
          ...(args.where ?? {}),
        };
        return query(args);
      },
    },
    researchProposal: {
      findMany({ args, query }) {
        args.where = {
          isArchived: false,
          ...(args.where ?? {}),
        };
        return query(args);
      },
      findFirst({ args, query }) {
        args.where = {
          isArchived: false,
          ...(args.where ?? {}),
        };
        return query(args);
      },
    },
  },
});

if (process.env.NODE_ENV !== "production") {
  global.prisma = basePrisma;
}

export type ResetEnvironment = Record<string, string | undefined>;

export type ResetTarget = {
  hostname: string;
  port: string;
  databaseName: string;
};

export function validateResetTarget(
  environment?: ResetEnvironment,
): ResetTarget;
export function formatResetTarget(target: ResetTarget): string;
export function resetSampleDatabase(environment?: ResetEnvironment): void;

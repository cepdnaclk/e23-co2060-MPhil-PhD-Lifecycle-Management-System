export function validateLifecycleDatabaseUrl(rawUrl?: string): string;

export function runLifecycleE2E(
  environment?: Record<string, string | undefined>,
): Promise<void>;

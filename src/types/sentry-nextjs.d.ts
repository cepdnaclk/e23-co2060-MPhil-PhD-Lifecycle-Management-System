declare module "@sentry/nextjs" {
  export function captureException(
    error: unknown,
    scopeCallback?: (scope: {
      setTag: (key: string, value: string) => void;
      setUser: (user: Record<string, unknown> | null) => void;
      setContext: (name: string, context: Record<string, unknown>) => void;
      setLevel: (level: string) => void;
    }) => void,
  ): void;
}

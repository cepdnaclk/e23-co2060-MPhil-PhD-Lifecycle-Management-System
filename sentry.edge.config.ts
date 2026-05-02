import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent } from "@sentry/core";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  sendDefaultPii: false,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  beforeSend(event: ErrorEvent) {
    if (event.user) {
      event.user = {
        id: event.user.id,
      };
    }

    if (event.request?.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
    }

    if (event.request?.cookies) {
      delete event.request.cookies;
    }

    return event;
  },
});

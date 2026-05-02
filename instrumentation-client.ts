import * as Sentry from "@sentry/nextjs";

function redactBrowserEvent(event: Sentry.Event): Sentry.Event {
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
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  sendDefaultPii: false,
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
  beforeSend(event: Sentry.Event) {
    return redactBrowserEvent(event);
  },
});

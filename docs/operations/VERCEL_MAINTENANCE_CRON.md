# Vercel Maintenance Cron

PGSMS uses `/api/cron/maintenance` to mark overdue milestones, remove expired
staged uploads, recover stale outbox leases, and deliver queued notifications.

## Deployment configuration

`vercel.json` registers a production cron invocation at `00:00 UTC` every day.
The daily interval is intentional because it is accepted by both Vercel Hobby
and paid plans. Teams on a paid plan may adopt a more frequent schedule in a
separate reviewed change if notification-delivery objectives require it.

Create `CRON_SECRET` in the Vercel project for the Production environment. It
must be a randomly generated value of at least 32 bytes. Do not use a public
framework prefix and do not commit the value. Vercel sends it to the route as:

```text
Authorization: Bearer <CRON_SECRET>
```

The route fails closed when the secret is absent, short, or incorrect. The
existing timestamped HMAC `POST` contract remains available for an approved
external scheduler; native Vercel Cron uses the bearer-authenticated `GET`.

## Deployment verification

After the production deployment:

1. Open the project's Cron Jobs page and confirm `/api/cron/maintenance` is
   registered with `0 0 * * *`.
2. Confirm the next invocation returns HTTP 200 in Vercel runtime logs.
3. Confirm the `maintenance_runs` table contains one `COMPLETED` row for the
   UTC date and that its JSON result includes milestone, upload, and outbox
   counts.
4. Review the Administrator notification-recovery screen for failed or
   dead-letter messages.
5. Configure an operational alert for a missing successful maintenance run or
   a non-zero dead-letter count; source code cannot provision that project-level
   alert automatically.

Repeated requests with the same UTC-day run key are rejected before work runs,
so a duplicate delivery cannot repeat lifecycle transitions or notifications.

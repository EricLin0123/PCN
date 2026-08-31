# AWS Deployment Plan for PCN Workbench

## Summary

Deploy the application on one Amazon Lightsail Ubuntu instance in Tokyo with:

- A Micro instance with 2 vCPUs, 1 GB RAM, 40 GB SSD, and a public IPv4 address for approximately US$7 per month.
- Caddy for automatic HTTPS, HTTP-to-HTTPS redirects, and separate basic-auth credentials for each user.
- Nuxt/Nitro running as a `systemd` service on `127.0.0.1:3000`.
- SQLite stored outside application releases at `/var/lib/pcn/pcn.db`.
- Daily Lightsail snapshots plus daily SQLite backups to a private S3 bucket.
- Manual deployment over SSH with a brief maintenance window.

This is the simplest fit because the application writes directly to SQLite. S3 static hosting, Lambda, App Runner, and typical autoscaling container deployments do not provide the persistent local filesystem this application currently requires. AWS documents App Runner storage as ephemeral and unsuitable for stateful applications: [Developing application code for App Runner](https://docs.aws.amazon.com/apprunner/latest/dg/develop.html).

The expected recurring cost is approximately US$7-9 per month, excluding the existing domain:

- US$7 per month for the Lightsail Micro instance.
- Incremental Lightsail snapshot storage at US$0.05 per GB-month.
- Negligible S3 storage and request charges for the current database, which is approximately 2.1 MB.
- No charge for a static IP while it remains attached to the instance.

See [Lightsail instance bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html) and [Lightsail billing and snapshot pricing](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-frequently-asked-questions-faq-billing-and-account-management.html) for current AWS pricing.

## AWS Infrastructure

1. Create an Ubuntu 24.04 Lightsail instance in `ap-northeast-1` (Tokyo) using the 1 GB Micro plan.
2. Create and attach a static IPv4 address. The static address prevents DNS from changing after an instance restart.
3. Configure the Lightsail firewall:
   - Allow TCP ports 80 and 443 from anywhere.
   - Allow TCP port 22 only from the administrator's current public IP address.
   - Do not expose the application's port 3000.
4. Point an existing subdomain, such as `pcn.example.com`, to the static IPv4 address using a DNS `A` record.
5. Enable automatic daily Lightsail snapshots. Lightsail keeps the seven most recent automatic snapshots; see [Manual and automatic snapshots](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-snapshots.html).
6. Create a private S3 backup bucket in Tokyo with:
   - Block Public Access enabled.
   - Default server-side encryption enabled.
   - Bucket versioning enabled.
   - A lifecycle policy retaining daily backups for 30 days and monthly backups for 12 months.
7. Create a dedicated IAM principal whose policy permits listing the backup bucket and reading or writing only the application's backup prefix. Do not grant general S3 or administrator access.
8. Create an AWS budget alert for unexpected monthly charges.

## Server Setup

1. Install Node.js 22, Caddy, the SQLite CLI, AWS CLI, and required system packages.
2. Create a dedicated unprivileged Linux account named `pcn`.
3. Create the following directories:
   - `/opt/pcn/releases/<timestamp>` for immutable application releases.
   - `/opt/pcn/current` as a symlink to the active release.
   - `/var/lib/pcn/pcn.db` as the persistent production database.
   - `/var/backups/pcn` for temporary database backups.
4. Give the `pcn` account access only to its release and data directories. Keep backup scripts and AWS credentials restricted to `root`.
5. Configure a `systemd` service with:
   - Working directory: `/opt/pcn/current`.
   - Command: `node .output/server/index.mjs`.
   - `NODE_ENV=production`.
   - `HOST=127.0.0.1`.
   - `PORT=3000`.
   - `PCN_DB_PATH=/var/lib/pcn/pcn.db`.
   - Automatic restart after unexpected failures.
6. Configure Caddy for the selected domain:
   - Generate a password hash for each user with `caddy hash-password`.
   - Protect the entire site, including `/api/*`, with `basic_auth`.
   - Reverse proxy authenticated requests to `127.0.0.1:3000`.
   - Allow Caddy to obtain and renew the TLS certificate and redirect HTTP to HTTPS automatically.

Caddy configuration references: [basic authentication](https://caddyserver.com/docs/caddyfile/directives/basic_auth), [reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), and [automatic HTTPS](https://caddyserver.com/docs/caddyfile/options).

## Initial Data Migration

Do not copy `data/pcn.db` while a local application process may be writing to it. SQLite WAL changes might otherwise be omitted.

1. Stop the local application or use the SQLite CLI's online `.backup` command to create a consistent database snapshot.
2. Run `PRAGMA integrity_check` against the snapshot and require the result to be `ok`.
3. Record representative row counts for important tables such as `pcn`, `ti_part`, `delta_form`, and `risk_assessment`.
4. Transfer the validated snapshot to the server as `/var/lib/pcn/pcn.db`.
5. Set ownership and permissions so only the `pcn` service account can read or write the database.
6. Start the service and compare the server's integrity result and representative row counts with the local snapshot.

The live database must never be placed inside `/opt/pcn/releases` or replaced as part of an application deployment.

## Manual Deployment Procedure

For every release:

1. Preserve current local changes and review `git status --short`.
2. Use Node.js 22 and run:
   - `npm ci`.
   - `npm run typecheck`.
   - `npm run build`.
   - `git diff --check`.
3. Create a release artifact containing `.output` and `data/schema.sql`. Do not include `data/pcn.db`, source workbooks, temporary databases, or Excel lock files.
4. Before changing the server release, create and validate a timestamped SQLite backup.
5. Upload the artifact to a new `/opt/pcn/releases/<timestamp>` directory.
6. Stop the `pcn` service, switch `/opt/pcn/current` to the new release, and start the service.
7. Verify the HTTPS endpoint, authentication, dashboard, and a representative API request.
8. Keep at least the previous release for rollback.

To roll back application code, stop the service, switch `/opt/pcn/current` to the preceding release, and restart it. Do not automatically roll back the database: restore it only when a database change is known to be incompatible or corrupt.

## Database Backups

1. Install a root-owned daily `systemd` timer or cron job.
2. The backup task must:
   - Create a consistent timestamped database using SQLite `.backup` while the application is running.
   - Run `PRAGMA integrity_check` against the backup.
   - Stop immediately without uploading if validation fails.
   - Compress the valid backup.
   - Upload it to the private S3 backup prefix.
   - Delete the temporary local copy only after the upload succeeds.
3. Store the restricted AWS credentials with root-only permissions.
4. Monitor backup exit status and periodically confirm that new objects appear in S3.
5. Retain the seven rolling Lightsail snapshots as full-server recovery points in addition to database-specific S3 backups.

## Interfaces and Security

- No application API, database schema, or business-logic changes are required for this deployment.
- `PCN_DB_PATH` is the production persistence boundary. Releases may contain `data/schema.sql` but never the production database.
- Every UI and API request requires HTTPS basic authentication.
- Each team member receives a separate username and password.
- Basic authentication provides gateway access only. It does not provide application roles, password recovery, or user-level change auditing.
- SQLite and S3 remain private. Only Caddy accepts public web traffic.
- Remove a departing user by deleting their Caddy credential and reloading Caddy.
- Keep the OS, Node.js, and Caddy patched on a regular maintenance schedule.

## Launch Validation

Before declaring the deployment complete:

1. Confirm an unauthenticated request returns HTTP `401`.
2. Confirm every intended user can authenticate over HTTPS.
3. Confirm HTTP redirects to HTTPS and the certificate is valid for the selected domain.
4. Verify dashboard loading, PCN filtering, Excel export, PCN editing, RA editing, and Delta-form editing.
5. Run `PRAGMA integrity_check` against the deployed database.
6. Confirm expected representative table counts.
7. Restart the application service and confirm edits remain present.
8. Reboot the instance and confirm the service starts automatically and retains its data.
9. Trigger an S3 backup manually and confirm it completes successfully.
10. Download a backup to a separate temporary location, validate it, and start the application against that restored copy without touching the live database.

## Recovery Procedures

For accidental data loss or database corruption:

1. Stop the application.
2. Preserve the damaged database for investigation.
3. Download the newest valid S3 database backup to a temporary location.
4. Run integrity and representative row-count checks.
5. Replace `/var/lib/pcn/pcn.db` only after validation.
6. Restore ownership and permissions, start the service, and verify the application.

For complete instance loss:

1. Create a replacement Lightsail instance from the newest usable instance snapshot.
2. Reattach the existing static IP.
3. Confirm DNS, firewall, Caddy, and the application service.
4. If the latest S3 database backup is newer than the snapshot database, validate and restore the S3 copy.
5. Complete the full launch-validation checklist.

## Assumptions and Accepted Tradeoffs

- The app serves a small internal team with light concurrent usage.
- Brief downtime during deployments and recovery is acceptable.
- Tokyo is the preferred AWS region for users in Taiwan.
- The organization controls DNS for an existing domain.
- Per-user basic authentication is acceptable for the first release.
- Cognito or corporate SSO, role-based permissions, and user-level audit trails are deferred.
- A single Lightsail instance is intentionally not highly available. If high availability becomes necessary, migrate away from local SQLite to a managed network database before adding multiple application instances.
- Existing uncommitted application and database changes must be preserved and included only after validation.

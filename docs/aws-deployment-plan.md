# AWS Deployment Plan for PCN Workbench

## Recommended Architecture

Run the application on one Amazon Lightsail Ubuntu instance in Tokyo:

- Lightsail Micro: 2 vCPUs, 1 GB RAM, 40 GB SSD, approximately US$7 per month.
- Caddy for HTTPS, certificate renewal, HTTP-to-HTTPS redirection, and reverse proxying.
- The application's built-in admin/operator login, configured with environment variables.
- Nuxt/Nitro managed by `systemd` and listening only on `127.0.0.1:3000`.
- SQLite stored persistently at `/var/lib/pcn/pcn.db`, outside application releases.
- Seven daily Lightsail snapshots and one daily SQLite backup uploaded to private S3.
- Manual deployment over SSH using a locally built release.

This is intentionally a single-server deployment. It is inexpensive and easy to understand, but brief downtime is expected during deployments and recovery. Do not use S3 static hosting, Lambda, App Runner, or multiple application instances while SQLite remains the runtime database.

Expected recurring cost is approximately US$7-9 per month, excluding the existing domain. The current database is about 15 MB, so S3 database-backup cost is negligible. Verify current pricing before purchase using [Lightsail instance bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html) and [Lightsail snapshot pricing](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-frequently-asked-questions-faq-billing-and-account-management.html).

## 1. Create the AWS Resources

1. Create an Ubuntu 24.04 Lightsail instance in `ap-northeast-1` (Tokyo) using the 1 GB Micro plan.
2. Attach a static IPv4 address.
3. Configure the Lightsail firewall:
   - Allow TCP 80 and 443 from anywhere.
   - Allow TCP 22 only from the administrator's current public IP address.
   - Do not expose port 3000.
4. Point an existing subdomain, such as `pcn.example.com`, to the static IP with a DNS `A` record.
5. Enable automatic daily Lightsail snapshots. Lightsail retains the seven most recent automatic snapshots.
6. Create one private S3 bucket in Tokyo for SQLite backups:
   - Keep Block Public Access enabled.
   - Keep the default server-side encryption enabled.
   - Do not enable bucket versioning for this simple deployment.
   - Add a lifecycle rule that deletes backups after 90 days.
7. Create one IAM access key restricted to listing that bucket and reading/writing only the `database/` prefix. Do not grant administrator or general S3 access.
8. Create an AWS monthly budget alert.

All AWS resources can be created with AWS CLI, but using the Lightsail console for the one-time server creation is acceptable and easier to review.

## 2. Prepare the Server

SSH to the instance and install Node.js 22 LTS, Caddy, SQLite CLI, and AWS CLI v2.

Create an unprivileged service account and these directories:

```text
/opt/pcn/releases/<timestamp>  immutable application releases
/opt/pcn/current               symlink to the active release
/var/lib/pcn/pcn.db            live SQLite database
/var/backups/pcn               temporary backup directory
/etc/pcn/pcn.env               production environment and login credentials
```

The `pcn` account owns `/opt/pcn` and `/var/lib/pcn`. The environment file is owned by `root`, belongs to the `pcn` group, and uses mode `0640`. AWS credentials and backup scripts remain readable only by `root`.

## 3. Configure Authentication

Use the application's built-in login. Do not configure Caddy basic authentication.

Create `/etc/pcn/pcn.env` with:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
PCN_DB_PATH=/var/lib/pcn/pcn.db
PCN_AUTH_ENABLED=true

PCN_ADMIN_USERNAME=choose-a-production-admin-name
PCN_ADMIN_PASSWORD=choose-a-long-unique-admin-password
PCN_OPERATOR_USERNAME=choose-a-production-operator-name
PCN_OPERATOR_PASSWORD=choose-a-long-unique-operator-password
```

Credential rules:

- Use unique production usernames and long, randomly generated passwords.
- Do not reuse development credentials.
- Do not place the production environment file in the repository, release archive, shell history, or S3 backup bucket.
- Give the admin credential only to administrators and the operator credential only to the operating team.

The current application creates an account from these variables only when its username does not already exist. It does not update an existing account's password. Therefore:

1. Use production usernames that do not already exist in the copied database.
2. Before the first production start, disable existing development accounts on the deployment database copy:

   ```sql
   UPDATE app_user SET enabled = 0;
   DELETE FROM auth_session;
   ```

3. Start the application with `/etc/pcn/pcn.env`; it will create the new admin and operator accounts.
4. Confirm both accounts can sign in and that old accounts cannot sign in.

For this simple deployment, password rotation means choosing a new username and password in `/etc/pcn/pcn.env`, restarting once to create that account, confirming login, and then disabling the previous account in SQLite. Merely changing the password variable for an existing username does not rotate its password.

## 4. Configure the Application Service

Create a `systemd` service with:

- User and group: `pcn`.
- Working directory: `/opt/pcn/current`.
- Environment file: `/etc/pcn/pcn.env`.
- Command: `node .output/server/index.mjs`.
- Restart after unexpected failure.
- Start after networking is available.

Enable the service so it starts automatically after a reboot.

## 5. Configure Caddy

Caddy performs only TLS termination and reverse proxying:

```caddyfile
pcn.example.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
  log
}
```

Replace the example domain, validate the configuration, and reload Caddy. Caddy will request and renew the HTTPS certificate automatically after DNS points to the instance and ports 80 and 443 are open.

Do not expose the Nitro port or disable application authentication. Review Caddy access logs if repeated login failures or unusual traffic are suspected.

## 6. Prepare and Transfer the Initial Database

Never copy `data/pcn.db` while another process may be writing to it. Create a consistent SQLite backup:

```bash
sqlite3 data/pcn.db ".backup '/tmp/pcn-deploy.db'"
sqlite3 /tmp/pcn-deploy.db 'PRAGMA integrity_check;'
sqlite3 /tmp/pcn-deploy.db 'PRAGMA foreign_key_check;'
```

The integrity result must be `ok`, and the foreign-key check must return no rows.

On this deployment copy only, disable development accounts and clear sessions:

```bash
sqlite3 /tmp/pcn-deploy.db 'UPDATE app_user SET enabled = 0; DELETE FROM auth_session;'
```

Transfer the copy to `/var/lib/pcn/pcn.db`, set it to owner/group `pcn`, and restrict its permissions. Never transfer or replace the live database as part of an application release.

Record representative row counts before and after transfer for `pcn`, `ti_part`, `delta_form`, `delta_ti_part_mapping`, `risk_assessment`, `material_month_revenue`, `ti_part_organization`, and `pcn_csc_upload`.

## 7. Build and Deploy a Release

Build on the development computer with Node.js 22:

```bash
git status --short
npm ci
npm run typecheck
npm run build
git diff --check
```

Create a release archive containing only:

```text
.output/
data/schema.sql
```

Do not include `data/pcn.db`, `.env`, source workbooks, temporary databases, logs, or Excel lock files.

For every deployment:

1. Create and validate a database backup.
2. Upload the release into a new `/opt/pcn/releases/<timestamp>` directory.
3. Test the new release against a copy of production, not the live database. Confirm startup, `PRAGMA integrity_check`, and `PRAGMA foreign_key_check`.
4. Stop the `pcn` service.
5. Change `/opt/pcn/current` to the new release.
6. Start the service.
7. Test HTTPS, login, the dashboard, and a representative API request.
8. Retain the previous release for rollback.

To roll back code, stop the service, point `/opt/pcn/current` to the previous release, and restart it. Do not roll back the database unless the new release changed it incompatibly and the validated pre-deployment backup must be restored.

## 8. Configure Daily Database Backups

Use one root-owned daily `systemd` timer. The backup command must:

1. Create a timestamped SQLite `.backup` while the application is running.
2. Run `PRAGMA integrity_check` and `PRAGMA foreign_key_check` on the backup.
3. Compress the valid backup.
4. Upload it to `s3://<backup-bucket>/database/`.
5. Delete the temporary local copy only after a successful upload.
6. Return a failure status if any step fails so it is visible in the system journal.

Once a month, manually download the newest S3 backup, validate it, and start the application against that restored copy. A backup is not considered reliable until restoration has been tested.

Lightsail snapshots provide full-server recovery, while S3 SQLite backups provide precise database recovery. Automatic Lightsail snapshots are deleted with the source instance, so retain at least one manual snapshot before destructive instance work.

## 9. Launch Checklist

Before declaring production ready:

- An unauthenticated API request returns `401`.
- Admin and operator credentials both work over HTTPS.
- Disabled development accounts cannot sign in.
- The operator cannot perform admin-only CSC confirmation or SBE champion changes.
- The admin can perform those actions.
- Login, logout, and the 12-hour session expiry work.
- Dashboard, executive, PCN, Parts, SBE, and organization pages load.
- Filtering, charts, and Excel export work.
- PCN, Delta-form, RA, and CSC edits persist after service restart.
- `PRAGMA integrity_check` returns `ok` and `PRAGMA foreign_key_check` returns no rows.
- Representative row counts match the source database.
- Caddy redirects HTTP to HTTPS and presents a valid certificate.
- Port 3000 is not reachable publicly.
- Rebooting the instance starts Caddy and the application automatically.
- A database backup is present in S3 and has been restored successfully to a temporary location.

## 10. Recovery

For application-release failure:

1. Stop the service.
2. Switch `/opt/pcn/current` to the previous release.
3. Start the service and run the launch smoke checks.

For database loss or corruption:

1. Stop the service.
2. Preserve the damaged database for investigation.
3. Download the newest valid S3 backup to a temporary path.
4. Run both SQLite integrity checks and compare representative row counts.
5. Replace `/var/lib/pcn/pcn.db`, restore ownership and permissions, and start the service.
6. Delete restored `auth_session` rows if the recovery relates to a security incident.

For complete instance loss:

1. Create a replacement instance from the newest usable Lightsail snapshot.
2. Reattach the static IP.
3. Restore a newer validated S3 database backup if necessary.
4. Confirm firewall, DNS, environment permissions, Caddy, authentication, backups, and application behavior.

## Assumptions

- The application is used by a small internal team with light concurrent traffic.
- One shared admin credential and one shared operator credential are acceptable.
- Brief downtime during deployment or recovery is acceptable.
- The domain is already owned and its DNS can be changed.
- Tokyo is the preferred AWS region for users in Taiwan.
- High availability, Cognito, SSO, individual user administration, password recovery, and detailed user-level auditing are intentionally out of scope.
- If usage, security, or availability requirements grow, revisit authentication and migrate away from local SQLite before adding multiple application instances.

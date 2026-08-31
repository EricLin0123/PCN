# PCN Workbench AWS Production Runbook

## Current deployment

The production deployment was created on 2026-09-01 in AWS account
`387367330632`.

| Item | Value |
| --- | --- |
| Application URL | `https://16-76-33-149.sslip.io` |
| AWS Region | `ap-northeast-1` (Tokyo) |
| Lightsail instance | `pcn-workbench-prod` |
| Lightsail plan | `micro_3_0`: 2 vCPU, 1 GB RAM, 40 GB SSD, US$7/month |
| Static IP | `pcn-workbench-prod-ip` / `16.76.33.149` |
| SSH key pair | `pcn-workbench-prod-key` |
| Local private key | `/Users/wanchuan/.ssh/pcn-workbench-prod` |
| Active initial release | `/opt/pcn/releases/20260831T161448Z` |
| Live database | `/var/lib/pcn/pcn.db` |
| Backup bucket | `pcn-workbench-backup-387367330632-ap-northeast-1` |
| Backup IAM user | `pcn-backup-prod` |
| Cost budget | `PCN total AWS monthly cost 10 USD` |
| Halt function | `pcn-budget-emergency-halt` in `us-east-1` |
| Halt topic | `arn:aws:sns:us-east-1:387367330632:pcn-total-cost-budget-alert` |

The current URL uses `sslip.io` because no owned production domain was supplied.
It has a publicly trusted certificate, but an owned subdomain should replace it
for long-term production use.

The instance runs Ubuntu 24.04, Node.js 22, Caddy, SQLite, and AWS CLI v2. The
application listens only on `127.0.0.1:3000`. Caddy exposes ports 80 and 443.
Port 22 is open from any IPv4 address at the Lightsail firewall by request, but
SSH accepts only the dedicated key: password and keyboard-interactive login are
disabled, and direct root login is disabled.

## Access and credentials

Connect with:

```bash
ssh -i /Users/wanchuan/.ssh/pcn-workbench-prod \
  -o IdentitiesOnly=yes \
  ubuntu@16.76.33.149
```

The production usernames and generated passwords are stored only in
`/etc/pcn/pcn.env`, owned by `root:pcn` with mode `0640`. Retrieve them over the
encrypted SSH connection and do not paste them into the repository or shell
history:

```bash
sudo awk -F= '/^PCN_(ADMIN|OPERATOR)_(USERNAME|PASSWORD)=/{print}' /etc/pcn/pcn.env
```

The initial usernames are `pcn-admin` and `pcn-operator`. The copied development
accounts `admin` and `csc` are disabled. The server-side backup access key is in
`/root/.aws/credentials`, owned by root with mode `0600`; it can access only the
backup bucket's `database/` prefix.

To rotate an application credential, choose a new username and password in
`/etc/pcn/pcn.env`, restart `pcn.service` once so the account is created, verify
the new login, then disable the previous account and clear its sessions:

```bash
sudo systemctl restart pcn.service
sudo sqlite3 /var/lib/pcn/pcn.db \
  "UPDATE app_user SET enabled=0 WHERE username='OLD_USERNAME'; DELETE FROM auth_session;"
```

Changing only the password for an existing username does not update that
account's stored password hash.

## Service and backup operations

Useful checks are:

```bash
sudo systemctl status pcn.service caddy.service pcn-backup.timer
sudo journalctl -u pcn.service -n 100 --no-pager
sudo journalctl -u caddy.service -n 100 --no-pager
sudo journalctl -u pcn-backup.service -n 100 --no-pager
sudo sqlite3 /var/lib/pcn/pcn.db 'PRAGMA integrity_check; PRAGMA foreign_key_check;'
```

Automatic Lightsail snapshots run daily at `18:00 UTC` and retain the seven
most recent automatic snapshots. The SQLite timer runs daily at `18:30 UTC`,
validates the backup, compresses it, and uploads it to the private S3 bucket.
Objects under `database/` expire after 90 days. Trigger and check a backup with:

```bash
sudo systemctl start pcn-backup.service
sudo systemctl show pcn-backup.service -p Result -p ExecMainStatus
sudo /usr/local/bin/aws s3 ls \
  s3://pcn-workbench-backup-387367330632-ap-northeast-1/database/ \
  --region ap-northeast-1
```

At least monthly, download the newest object to a temporary location, decompress
it, run both SQLite checks, and start the app against that copy. This was done
successfully during launch.

## Deploy an application update

Never copy or replace the live database during a code release.

1. From the repository, validate and build:

   ```bash
   git status --short
   npm ci
   npm run typecheck
   npm run build
   git diff --check
   ```

2. Create a fresh server backup and confirm success:

   ```bash
   ssh -i /Users/wanchuan/.ssh/pcn-workbench-prod \
     -o IdentitiesOnly=yes ubuntu@16.76.33.149 \
     'sudo systemctl start pcn-backup.service && sudo systemctl show pcn-backup.service -p Result -p ExecMainStatus'
   ```

3. Create a release archive containing only `.output/` and `data/schema.sql`,
   and upload it. Use a new UTC release identifier:

   ```bash
   release_id=$(date -u +%Y%m%dT%H%M%SZ)
   COPYFILE_DISABLE=1 tar -czf "/tmp/pcn-$release_id.tar.gz" .output data/schema.sql
   scp -i /Users/wanchuan/.ssh/pcn-workbench-prod \
     -o IdentitiesOnly=yes "/tmp/pcn-$release_id.tar.gz" \
     ubuntu@16.76.33.149:/tmp/
   ```

4. On the server, unpack to `/opt/pcn/releases/<release_id>`. Before switching,
   use SQLite `.backup` to copy production to a root-owned temporary database and
   test the new release against that copy. Confirm startup, `integrity_check`,
   `foreign_key_check`, authentication, and a representative API request.

5. Switch code only:

   ```bash
   sudo systemctl stop pcn.service
   sudo ln -sfn "/opt/pcn/releases/$release_id" /opt/pcn/current
   sudo chown -R pcn:pcn "/opt/pcn/releases/$release_id"
   sudo systemctl start pcn.service
   ```

6. Check HTTPS, both roles, the dashboard, and a representative edit. Keep the
   previous release. To roll code back, stop the service, repoint
   `/opt/pcn/current` to the previous release, and restart. Do not roll back the
   database unless an incompatible schema change requires restoring the verified
   pre-deployment backup.

The checked-in service, backup, Caddy, environment-generator, and Lambda source
are under `ops/aws/`. If the halt Lambda source changes, deploy it with:

```bash
zip -j /tmp/pcn-budget-emergency-halt.zip ops/aws/budget-halt/lambda_function.py
aws lambda update-function-code --region us-east-1 \
  --function-name pcn-budget-emergency-halt \
  --zip-file fileb:///tmp/pcn-budget-emergency-halt.zip
```

## Replace the temporary hostname

Create an `A` record for an owned subdomain pointing to `16.76.33.149`. Then edit
`/etc/caddy/Caddyfile`, replace `16-76-33-149.sslip.io` with the owned hostname,
validate, and reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy.service
```

Keep ports 80 and 443 open while Caddy obtains and renews certificates. Verify
the new hostname before removing the old site address from Caddy.

## Cost budget and emergency halt

### Retrieve current cost without Cost Explorer API charges

The Cost Explorer API charges US$0.01 per request. To retrieve the deployed
account-wide estimate without calling that API, read the calculated spend from
the existing budget:

```bash
aws budgets describe-budget \
  --account-id 387367330632 \
  --budget-name 'PCN total AWS monthly cost 10 USD' \
  --query 'Budget.CalculatedSpend' \
  --output table
```

For only the current actual amount:

```bash
aws budgets describe-budget \
  --account-id 387367330632 \
  --budget-name 'PCN total AWS monthly cost 10 USD' \
  --query 'Budget.CalculatedSpend.ActualSpend.Amount' \
  --output text
```

Budget monitoring is free (and this account is within the first two free
action-enabled budgets). The value is an AWS estimate, not real-time billing;
AWS updates budget data up to three times daily and billing data can lag.

The fixed monthly budget covers total account cost, including tax,
subscriptions, support, recurring and upfront charges, refunds, credits, and
discounts. Its limit is US$10. An actual-cost notification fires when cost is
greater than US$9.99, which approximates "touches US$10" despite the API's
strict greater-than operator.

The notification publishes to SNS, which immediately invokes the Lambda. The
Lambda closes public ports 80 and 443 and requests a stop of only
`pcn-workbench-prod`. Port 22 remains available for recovery. IAM permits the
write actions only on that instance. A non-halting Lambda test and IAM policy
simulation passed during launch.

AWS Budgets is not an instantaneous spending control. AWS states that budget
data is updated up to three times per day, typically every 8–12 hours, and that
billing data can be delayed. Costs can therefore exceed US$10 before the alert
and halt run. Also, a stopped Lightsail instance continues to incur its bundled
instance charge. Delete resources using the termination section to stop those
charges completely.

No email address was added because no alert recipient was explicitly supplied.
To add an approved address to the existing threshold:

```bash
aws budgets create-subscriber \
  --account-id 387367330632 \
  --budget-name 'PCN total AWS monthly cost 10 USD' \
  --notification '{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":9.99,"ThresholdType":"ABSOLUTE_VALUE"}' \
  --subscriber SubscriptionType=EMAIL,Address=APPROVED_EMAIL_ADDRESS
```

When changing the budget, update both its `BudgetLimit` and the notification's
absolute threshold. Use `aws budgets update-budget` and
`aws budgets update-notification`, then describe both objects to confirm the new
values. Keep the halt threshold slightly below the desired exact-dollar limit.

After a budget halt, investigate cost before recovery. The budget remains in an
alarm state and should not be treated as a repeating circuit breaker. Raise or
disable the notification deliberately, start the instance, and reopen ports 80
and 443 only after the cost issue is resolved:

```bash
aws lightsail start-instance --region ap-northeast-1 \
  --instance-name pcn-workbench-prod
aws lightsail open-instance-public-ports --region ap-northeast-1 \
  --instance-name pcn-workbench-prod \
  --port-info fromPort=80,toPort=80,protocol=tcp,cidrs=0.0.0.0/0
aws lightsail open-instance-public-ports --region ap-northeast-1 \
  --instance-name pcn-workbench-prod \
  --port-info fromPort=443,toPort=443,protocol=tcp,cidrs=0.0.0.0/0
```

## Complete termination

These steps are destructive. First decide whether the final database and a
manual server snapshot must be retained. Download a validated S3 database backup
outside AWS before deleting the bucket. Automatic Lightsail snapshots are
deleted with the instance.

After preservation is confirmed, remove only the named PCN resources in this
order. Do not delete the pre-existing budget named
`CCU App EC2 zero spent budget`.

```bash
# Cost guardrail and its logs
aws budgets delete-budget --account-id 387367330632 \
  --budget-name 'PCN total AWS monthly cost 10 USD'
aws sns delete-topic --region us-east-1 \
  --topic-arn arn:aws:sns:us-east-1:387367330632:pcn-total-cost-budget-alert
aws lambda delete-function --region us-east-1 \
  --function-name pcn-budget-emergency-halt
aws logs delete-log-group --region us-east-1 \
  --log-group-name /aws/lambda/pcn-budget-emergency-halt
aws iam delete-role-policy --role-name pcn-budget-emergency-halt-role \
  --policy-name StopPCNWorkbenchLightsailOnly
aws iam detach-role-policy --role-name pcn-budget-emergency-halt-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name pcn-budget-emergency-halt-role

# Server backup identity
aws iam list-access-keys --user-name pcn-backup-prod
aws iam delete-access-key --user-name pcn-backup-prod \
  --access-key-id ACCESS_KEY_ID_CONFIRMED_ABOVE
aws iam delete-user-policy --user-name pcn-backup-prod \
  --policy-name PCNDatabaseBackupBucketOnly
aws iam delete-user --user-name pcn-backup-prod

# Compute and network. Confirm any wanted snapshot is preserved first.
aws lightsail delete-instance --region ap-northeast-1 \
  --instance-name pcn-workbench-prod
aws lightsail release-static-ip --region ap-northeast-1 \
  --static-ip-name pcn-workbench-prod-ip
aws lightsail delete-key-pair --region ap-northeast-1 \
  --key-pair-name pcn-workbench-prod-key

# Private backups. This permanently deletes every retained database backup.
aws s3 rm s3://pcn-workbench-backup-387367330632-ap-northeast-1 \
  --recursive --region ap-northeast-1
aws s3api delete-bucket \
  --bucket pcn-workbench-backup-387367330632-ap-northeast-1 \
  --region ap-northeast-1

# Local access material after AWS deletion is confirmed
rm -f /Users/wanchuan/.ssh/pcn-workbench-prod \
  /Users/wanchuan/.ssh/pcn-workbench-prod.pub
ssh-keygen -R 16.76.33.149
ssh-keygen -R 16-76-33-149.sslip.io
```

Finally, verify absence with `aws lightsail get-instances`, `aws s3api
list-buckets`, `aws iam get-user --user-name pcn-backup-prod`, `aws lambda
get-function`, `aws sns list-topics`, and `aws budgets describe-budgets`. Check
for manually created Lightsail snapshots and delete them separately if complete
AWS-side removal is intended.

## Launch validation record

The initial release passed local typecheck, production build, and
`git diff --check`. The source and deployed database both returned `ok` for
`PRAGMA integrity_check` and no foreign-key errors. Representative deployed and
restored-backup counts matched: 858 PCNs, 9,438 TI parts, 641 Delta forms, 9,634
Delta mappings, 183 risk assessments, 58,569 monthly revenue rows, 3,398
organization rows, and 0 CSC uploads.

Unauthenticated API access returned `401`; both production roles logged in; the
operator received `403` on an admin-only endpoint; old accounts received `401`;
HTTP redirected to HTTPS; HTTPS used a valid certificate; port 3000 was bound
only to loopback; the S3 backup restored successfully; and Caddy, the app, and
the backup timer were active after a Lightsail reboot.

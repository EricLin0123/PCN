#!/usr/bin/env bash
set -Eeuo pipefail

# Build and deploy the current PCN Workbench checkout to the production
# Lightsail instance. Git status and commit state do not affect deployment.
# The local SQLite database is included only when explicitly requested with
# PCN_DEPLOY_DATABASE=1.

repo_dir=$(git rev-parse --show-toplevel)
cd "$repo_dir"

ssh_key=${PCN_SSH_KEY:-/Users/wanchuan/.ssh/pcn-workbench-prod}
ssh_host=${PCN_SSH_HOST:-ubuntu@16.76.33.149}
ssh_options=(-i "$ssh_key" -o IdentitiesOnly=yes)
remote_root=${PCN_REMOTE_ROOT:-/opt/pcn}
remote_database=${PCN_REMOTE_DATABASE:-/var/lib/pcn/pcn.db}
health_url=${PCN_HEALTH_URL:-https://pcn.studio-on.tw}

if [[ ! -f "$ssh_key" ]]; then
  printf 'SSH key not found: %s\n' "$ssh_key" >&2
  exit 1
fi

npm ci
npm run typecheck
npm run build
git diff --check

commit_sha=$(git rev-parse --short HEAD 2>/dev/null || printf 'local')
release_id=$(date -u +%Y%m%dT%H%M%SZ)-$commit_sha
archive_path=$(mktemp "/tmp/pcn-$release_id.XXXXXX.tar.gz")
database_archive=''
if [[ ${PCN_DEPLOY_DATABASE:-0} == 1 ]]; then
  database_archive=$(mktemp "/tmp/pcn-$release_id.db.XXXXXX")
  sqlite3 data/pcn.db ".backup '$database_archive'"
  [[ $(sqlite3 "$database_archive" 'PRAGMA integrity_check;') == ok ]]
  [[ -z "$(sqlite3 "$database_archive" 'PRAGMA foreign_key_check;')" ]]
fi
cleanup() { rm -f "$archive_path" "$database_archive"; }
trap cleanup EXIT

COPYFILE_DISABLE=1 tar -czf "$archive_path" .output data/schema.sql

printf 'Creating a verified production database backup...\n'
ssh "${ssh_options[@]}" "$ssh_host" \
  'sudo systemctl start pcn-backup.service && sudo systemctl show pcn-backup.service -p Result -p ExecMainStatus'

printf 'Uploading release %s...\n' "$release_id"
scp "${ssh_options[@]}" "$archive_path" "$ssh_host:/tmp/pcn-$release_id.tar.gz"
if [[ -n "$database_archive" ]]; then
  scp "${ssh_options[@]}" "$database_archive" "$ssh_host:/tmp/pcn-$release_id.db"
fi

printf 'Activating release %s...\n' "$release_id"
ssh "${ssh_options[@]}" "$ssh_host" "
  set -Eeuo pipefail
  release_dir='$remote_root/releases/$release_id'
  sudo mkdir -p \"\$release_dir\"
  sudo tar -xzf '/tmp/pcn-$release_id.tar.gz' -C \"\$release_dir\"
  sudo chown -R pcn:pcn \"\$release_dir\"
  sudo systemctl stop pcn.service
  sudo ln -sfn \"\$release_dir\" '$remote_root/current'
  sudo systemctl start pcn.service
  rm -f '/tmp/pcn-$release_id.tar.gz'
  sudo systemctl is-active --quiet pcn.service
"

if [[ -n "$database_archive" ]]; then
  printf 'Activating explicitly requested database update...\n'
  ssh "${ssh_options[@]}" "$ssh_host" "
    set -Eeuo pipefail
    sudo systemctl stop pcn.service
    sudo install -o pcn -g pcn -m 0640 '/tmp/pcn-$release_id.db' '$remote_database'
    rm -f '/tmp/pcn-$release_id.db'
    sudo systemctl start pcn.service
    sudo systemctl is-active --quiet pcn.service
  "
fi

printf 'Checking %s...\n' "$health_url"
curl --fail --silent --show-error --head "$health_url" >/dev/null
printf 'Deployed commit %s as %s.\n' "$commit_sha" "$release_id"

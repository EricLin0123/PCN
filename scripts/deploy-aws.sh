#!/usr/bin/env bash
set -Eeuo pipefail

# Commit, build, and deploy the PCN Workbench release to the production
# Lightsail instance. The live SQLite database is never included.

repo_dir=$(git rev-parse --show-toplevel)
cd "$repo_dir"

ssh_key=${PCN_SSH_KEY:-/Users/wanchuan/.ssh/pcn-workbench-prod}
ssh_host=${PCN_SSH_HOST:-ubuntu@16.76.33.149}
ssh_options=(-i "$ssh_key" -o IdentitiesOnly=yes)
remote_root=${PCN_REMOTE_ROOT:-/opt/pcn}
health_url=${PCN_HEALTH_URL:-https://pcn.studio-on.tw}
commit_message=${1:-}

if [[ -z "$commit_message" ]]; then
  printf 'Usage: %s "commit message"\n' "${0##*/}" >&2
  exit 2
fi

if [[ ! -f "$ssh_key" ]]; then
  printf 'SSH key not found: %s\n' "$ssh_key" >&2
  exit 1
fi

if [[ -n "$(git diff --name-only --cached -- data/pcn.db)" ]]; then
  printf 'data/pcn.db is staged. Unstage it before deploying; the live database is never committed.\n' >&2
  exit 1
fi

git add -A
git reset -- data/pcn.db >/dev/null

if git diff --cached --quiet; then
  printf 'No deployable changes to commit.\n' >&2
  exit 1
fi

npm ci
npm run typecheck
npm run build
git diff --check

git commit -m "$commit_message"
commit_sha=$(git rev-parse --short HEAD)
release_id=$(date -u +%Y%m%dT%H%M%SZ)-$commit_sha
archive_path=$(mktemp "/tmp/pcn-$release_id.XXXXXX.tar.gz")
cleanup() { rm -f "$archive_path"; }
trap cleanup EXIT

COPYFILE_DISABLE=1 tar -czf "$archive_path" .output data/schema.sql

printf 'Creating a verified production database backup...\n'
ssh "${ssh_options[@]}" "$ssh_host" \
  'sudo systemctl start pcn-backup.service && sudo systemctl show pcn-backup.service -p Result -p ExecMainStatus'

printf 'Uploading release %s...\n' "$release_id"
scp "${ssh_options[@]}" "$archive_path" "$ssh_host:/tmp/pcn-$release_id.tar.gz"

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

printf 'Checking %s...\n' "$health_url"
curl --fail --silent --show-error --head "$health_url" >/dev/null
printf 'Deployed commit %s as %s.\n' "$commit_sha" "$release_id"

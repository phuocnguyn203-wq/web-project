#!/bin/sh
# Database dump + uploaded files into ./backups, keeping the newest 14 of each.
# Run from the repo root on the server; cron example (03:00 daily):
#   0 3 * * * cd /opt/lecturecards && sh deploy/backup.sh >> backups/backup.log 2>&1
set -eu
C="docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml"
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p backups

$C exec -T db pg_dump -U lc -Fc lc > "backups/db-$STAMP.dump"
$C exec -T api tar czf - -C /data uploads > "backups/uploads-$STAMP.tgz"

ls -1t backups/db-*.dump | tail -n +15 | xargs -r rm --
ls -1t backups/uploads-*.tgz | tail -n +15 | xargs -r rm --
echo "backup $STAMP ok"

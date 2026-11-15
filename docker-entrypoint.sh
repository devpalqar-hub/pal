#!/bin/sh
set -e
echo "Applying database migrations..."
npx prisma migrate deploy
echo "Seeding super admin (skipped if one exists)..."
npx prisma db seed
exec "$@"

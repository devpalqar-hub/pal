# PAL

Next.js (App Router, TypeScript) + MySQL + Prisma + JWT auth.

## Setup
1. `npm install`
2. Edit `.env` (`DATABASE_URL`, `JWT_SECRET`); template in `.env.example`
3. Create the DB schema: `npx prisma migrate dev --name init`
4. Create the first super admin: `npm run db:seed` (uses `SEED_ADMIN_*` in `.env`)
5. `npm run dev`

- No public sign-up: users are created by superiors (`POST /api/users`). Login via `POST /api/auth/login`, then send `Authorization: Bearer <token>`.
- Roles: SUPER_ADMIN > COMPANY_HEAD > MANAGER > LEAD > STAFF; you can only manage roles below yours. Schedule/leave: MANAGER+, salary: COMPANY_HEAD+.
- Attendance times use the server's local timezone.

## Projects & tasks
See [docs/WORKFLOW.md](docs/WORKFLOW.md) for permissions and the task lifecycle diagram.

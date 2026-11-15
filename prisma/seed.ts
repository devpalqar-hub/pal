import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@pal.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const name = process.env.SEED_ADMIN_NAME ?? "Super Admin";

  if (await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } })) {
    console.log("Super admin already exists, skipping.");
    return;
  }
  const user = await prisma.user.create({
    data: { email, name, role: "SUPER_ADMIN", password: await bcrypt.hash(password, 10) },
  });
  await prisma.roleChange.create({ data: { userId: user.id, toRole: "SUPER_ADMIN", changedById: user.id, note: "Seeded" } });
  console.log(`Created super admin ${email}`);
}

main().finally(() => prisma.$disconnect());

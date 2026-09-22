import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@example.com').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL must be a valid email address');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('User already exists; password and role were not changed.');
    return;
  }

  const password = process.env.ADMIN_PASSWORD ?? randomBytes(18).toString('base64url');
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('ADMIN_PASSWORD must contain at least 12 characters and at most 72 UTF-8 bytes');
  }
  const hash = await bcrypt.hash(password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const role = await tx.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN', description: 'Administrator' },
    });
    return tx.user.create({
      data: {
        email,
        password: hash,
        firstName: 'Admin',
        lastName: 'Workspace',
        roleId: role.id,
      },
    });
  });

  if (!(await bcrypt.compare(password, user.password))) {
    throw new Error('Password hash verification failed');
  }
  console.log(`Administrator created: ${email}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`Generated password (save it now): ${password}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

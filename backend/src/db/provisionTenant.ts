import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Prisma } from '@prisma/client';
import { prisma } from './connect.js';
import { assertValidSchemaName, quoteSchema } from './schemaUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function provisionTenantSchema(schemaName: string): Promise<void> {
  assertValidSchemaName(schemaName);
  const templatePath = path.join(__dirname, '..', '..', 'prisma', 'tenant-template.sql');
  const template = await fs.promises.readFile(templatePath, 'utf8');
  const sql = template.replaceAll('__SCHEMA__', schemaName);
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

export async function seedTenantSettings(schemaName: string, businessName: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO ${Prisma.raw(`${quoteSchema(schemaName)}.settings`)} (business_name)
    VALUES (${businessName})
  `;
}

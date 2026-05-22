import { prisma } from './connect.js';
import { buildSchemaName } from './schemaUtils.js';
import { provisionTenantSchema, seedTenantSettings } from './provisionTenant.js';

export async function createBusinessWithSchema(input: { name: string; slug: string }) {
  const slug = input.slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) {
    throw new Error('Invalid slug');
  }

  const existing = await prisma.business.findUnique({ where: { slug } });
  if (existing) {
    throw new Error('Business slug already exists');
  }

  const schemaName = buildSchemaName(slug);

  const business = await prisma.business.create({
    data: {
      slug,
      name: input.name.trim(),
      schemaName,
      status: 'active',
    },
  });

  try {
    await provisionTenantSchema(schemaName);
    await seedTenantSettings(schemaName, input.name.trim());
  } catch (err) {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
    throw err;
  }

  return business;
}

const SCHEMA_NAME_RE = /^[a-z][a-z0-9_]{2,62}$/;

export function assertValidSchemaName(schemaName: string): void {
  if (!SCHEMA_NAME_RE.test(schemaName)) {
    throw new Error('Invalid schema name');
  }
}

export function quoteSchema(schemaName: string): string {
  assertValidSchemaName(schemaName);
  return `"${schemaName}"`;
}

export function buildSchemaName(slug: string): string {
  const base = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  const suffix = Date.now().toString(36).slice(-6);
  const name = `biz_${base || 'store'}_${suffix}`;
  assertValidSchemaName(name);
  return name;
}

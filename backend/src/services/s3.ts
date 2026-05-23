import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const AWS_REGION = process.env.AWS_REGION;
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const INVOICE_PREFIX = process.env.AWS_S3_INVOICE_PREFIX || 'businesses';
const PRESIGN_EXPIRY_SECONDS = Number(
  process.env.AWS_S3_PRESIGN_EXPIRY_SECONDS || '604800'
);

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID!,
        secretAccessKey: AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return s3Client;
}

export function validateS3Config(): boolean {
  return Boolean(
    AWS_REGION &&
      AWS_S3_BUCKET &&
      AWS_ACCESS_KEY_ID &&
      AWS_SECRET_ACCESS_KEY
  );
}

function sanitizeInvoiceNumber(invoiceNumber: string): string {
  return invoiceNumber.replace(/[^A-Za-z0-9_-]/g, '_');
}

export function buildInvoiceObjectKey(
  businessId: string,
  invoiceNumber: string
): string {
  const safeNumber = sanitizeInvoiceNumber(invoiceNumber);
  return `${INVOICE_PREFIX}/${businessId}/invoices/${safeNumber}.pdf`;
}

export async function uploadInvoicePdf(
  businessId: string,
  invoiceNumber: string,
  body: Buffer
): Promise<string> {
  if (!validateS3Config()) {
    throw new Error(
      'S3 config missing (AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)'
    );
  }

  const key = buildInvoiceObjectKey(businessId, invoiceNumber);
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: AWS_S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: 'application/pdf',
    })
  );
  return key;
}

export async function getInvoicePresignedUrl(
  businessId: string,
  invoiceNumber: string
): Promise<string> {
  if (!validateS3Config()) {
    throw new Error(
      'S3 config missing (AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)'
    );
  }

  const key = buildInvoiceObjectKey(businessId, invoiceNumber);
  const expiry = Number.isFinite(PRESIGN_EXPIRY_SECONDS) && PRESIGN_EXPIRY_SECONDS > 0
    ? PRESIGN_EXPIRY_SECONDS
    : 604800;

  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: AWS_S3_BUCKET,
      Key: key,
    }),
    { expiresIn: expiry }
  );
}

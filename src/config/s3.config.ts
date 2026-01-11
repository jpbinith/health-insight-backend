import { S3Client } from '@aws-sdk/client-s3';

let client: S3Client | null = null;

export const getS3Client = (): S3Client => {
  if (client) {
    return client;
  }

  const region = process.env.AWS_REGION;

  if (!region) {
    throw new Error(
      'AWS credentials are not fully configured. Check AWS_REGION',
    );
  }

  client = new S3Client({
    region,
  });

  return client;
};

export const getS3BucketName = (): string => {
  const bucket = process.env.AWS_S3_BUCKET;

  if (!bucket) {
    throw new Error('AWS_S3_BUCKET environment variable is not defined.');
  }

  return bucket;
};

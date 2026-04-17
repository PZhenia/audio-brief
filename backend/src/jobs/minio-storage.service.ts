import { Injectable } from '@nestjs/common';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const defaultEndpoint = 'http://localhost:9000';

@Injectable()
export class MinioStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const endpoint = process.env.MINIO_ENDPOINT ?? defaultEndpoint;
    this.bucket = process.env.MINIO_BUCKET ?? 'transcriptions';
    this.client = new S3Client({
      region: process.env.MINIO_REGION ?? 'us-east-1',
      endpoint,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'yevheniia',
        secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'web_2026',
      },
      forcePathStyle: true,
    });
  }

  async getObjectText(key: string): Promise<string> {
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return (await out.Body?.transformToString()) ?? '';
  }

  async getPresignedGetUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, cmd, { expiresIn: expiresInSeconds });
  }
}

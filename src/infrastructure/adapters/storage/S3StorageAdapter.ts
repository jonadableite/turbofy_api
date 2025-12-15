
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StoragePort } from '../../../ports/StoragePort';
import { env } from '../../../config/env';

export class S3StorageAdapter implements StoragePort {
  private client: S3Client;
  private bucketName: string;

  constructor(bucketName: string = env.STORAGE_BUCKET_NAME || 'turbofy-uploads') {
    const config: any = {
      region: env.AWS_REGION || 'us-east-1',
    };

    if (env.S3_ENABLED) {
      config.region = env.S3_REGION || config.region;

      if (env.S3_ENDPOINT) {
        const protocol = env.S3_USE_SSL ? 'https' : 'http';
        const port = env.S3_PORT && env.S3_PORT !== 443 && env.S3_PORT !== 80 ? `:${env.S3_PORT}` : '';
        
        if (env.S3_ENDPOINT.startsWith('http')) {
          config.endpoint = env.S3_ENDPOINT;
        } else {
          config.endpoint = `${protocol}://${env.S3_ENDPOINT}${port}`;
        }
      }

      if (env.S3_ACCESS_KEY && env.S3_SECRET_KEY) {
        config.credentials = {
          accessKeyId: env.S3_ACCESS_KEY,
          secretAccessKey: env.S3_SECRET_KEY,
        };
      }

      config.forcePathStyle = true;

      if (env.S3_BUCKET) {
        this.bucketName = env.S3_BUCKET;
      } else {
        this.bucketName = bucketName;
      }
    } else {
      this.bucketName = bucketName;
    }

    this.client = new S3Client(config);
  }

  async generatePresignedUploadUrl(key: string, contentType: string, expiresInSeconds: number = 300): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async generatePresignedDownloadUrl(key: string, expiresInSeconds: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async getFileMetadata(key: string): Promise<{ size: number; mimeType: string } | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      const response = await this.client.send(command);
      return {
        size: response.ContentLength || 0,
        mimeType: response.ContentType || 'application/octet-stream',
      };
    } catch (error) {
      return null;
    }
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    await this.client.send(command);
  }
}


import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly client: S3Client;
  readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>("ASSET_BUCKET");
    this.client = new S3Client({
      region: config.getOrThrow<string>("S3_REGION"),
      endpoint: config.get<string>("S3_ENDPOINT") || undefined,
      forcePathStyle: config.getOrThrow<boolean>("S3_FORCE_PATH_STYLE"),
      credentials: {
        accessKeyId: config.getOrThrow<string>("S3_ACCESS_KEY_ID"),
        secretAccessKey: config.getOrThrow<string>("S3_SECRET_ACCESS_KEY"),
      },
    });
  }

  /** Promise pembuatan bucket (sekali); di-reset bila gagal agar dicoba lagi pada pemakaian berikutnya. */
  private bucketReady?: Promise<void>;

  async onModuleInit() {
    try {
      await this.ensureBucketReady();
    } catch (error) {
      // Jangan gagalkan boot API bila storage belum siap; bucket dicoba lagi saat upload pertama.
      this.logger.warn(`Object storage belum siap: ${error instanceof Error ? error.message : error}`);
    }
  }

  private ensureBucketReady() {
    this.bucketReady ??= this.ensureBucket().catch((error: unknown) => {
      this.bucketReady = undefined;
      throw error;
    });
    return this.bucketReady;
  }

  async putObject(params: {
    key: string;
    body: Buffer | Readable;
    contentLength: number;
    contentType: string;
    checksum: string;
  }) {
    await this.ensureBucketReady();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.body,
        ContentLength: params.contentLength,
        ContentType: params.contentType,
        Metadata: { checksum: params.checksum },
      }),
    );
  }

  async getObject(key: string) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return result.Body as Readable;
  }

  async getObjectBuffer(key: string) {
    const stream = await this.getObject(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }

  async copyObject(sourceKey: string, targetKey: string) {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: targetKey,
        CopySource: `${this.bucket}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`,
      }),
    );
  }

  async deleteObject(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** Dipakai health check: pastikan bucket ada (dibuat bila storage baru siap), lalu cek aksesnya. */
  async ping() {
    await this.ensureBucketReady();
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  private async ensureBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket '${this.bucket}' dibuat.`);
    }
  }
}

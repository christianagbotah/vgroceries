import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { ProductMediaStorageError, type ProductMediaStorage, type PutProductMediaInput, type StoredProductMedia } from "./product-media.storage";
import { parseProductMediaStorageKey } from "./storage-key";

export interface S3ProductMediaStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}

type S3Sender = Pick<S3Client, "send">;

export class S3ProductMediaStorage implements ProductMediaStorage {
  private readonly client: S3Sender;
  constructor(private readonly config: S3ProductMediaStorageConfig, client?: S3Sender) {
    if (!config.publicBaseUrl.endsWith("/")) throw new Error("Product media public base URL must end in /.");
    this.client = client ?? new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      forcePathStyle: true,
    });
  }

  async put(input: PutProductMediaInput): Promise<StoredProductMedia> {
    const parsed = parseProductMediaStorageKey(input.key);
    if (parsed.visibility !== input.visibility) throw new Error("Product media visibility does not match its storage key.");
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: input.key,
      Body: input.bytes,
      ContentType: input.contentType,
      CacheControl: input.visibility === "public" ? "public,max-age=31536000,immutable" : "private,no-store",
    }));
    return {
      storageKey: input.key,
      byteSize: input.bytes.length,
      ...(input.visibility === "public" ? { publicUrl: this.publicUrl(input.key) } : {}),
    };
  }

  async read(storageKey: string): Promise<Buffer> {
    parseProductMediaStorageKey(storageKey);
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: storageKey })) as any;
    if (!result.Body) throw new ProductMediaStorageError("STORAGE_NOT_FOUND", "Product media object not found.");
    if (typeof result.Body.transformToByteArray === "function") return Buffer.from(await result.Body.transformToByteArray());
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async delete(storageKey: string): Promise<void> {
    parseProductMediaStorageKey(storageKey);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: storageKey }));
  }

  async exists(storageKey: string): Promise<boolean> {
    parseProductMediaStorageKey(storageKey);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: storageKey }));
      return true;
    } catch (error: any) {
      const status = error?.$metadata?.httpStatusCode;
      if (status === 404 || error?.name === "NotFound" || error?.name === "NoSuchKey") return false;
      throw error;
    }
  }

  publicUrl(storageKey: string): string {
    const parsed = parseProductMediaStorageKey(storageKey);
    if (parsed.visibility !== "public") throw new Error("Private product media has no public URL.");
    return this.config.publicBaseUrl + storageKey.slice("public/".length);
  }
}

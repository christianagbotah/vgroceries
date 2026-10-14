import type { ProductMediaVisibility } from "./storage-key";

export interface PutProductMediaInput {
  key: string;
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  visibility: ProductMediaVisibility;
}

export interface StoredProductMedia {
  storageKey: string;
  byteSize: number;
  publicUrl?: string;
}

export interface ProductMediaStorage {
  put(input: PutProductMediaInput): Promise<StoredProductMedia>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
  publicUrl(storageKey: string): string;
}

export class ProductMediaStorageError extends Error {
  constructor(
    readonly code: "STORAGE_UNAVAILABLE" | "STORAGE_KEY_CONFLICT" | "STORAGE_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "ProductMediaStorageError";
  }
}

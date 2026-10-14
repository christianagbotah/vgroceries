import { mkdir, readFile, unlink, writeFile, access } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { ProductMediaStorageError, type ProductMediaStorage, type PutProductMediaInput, type StoredProductMedia } from "./product-media.storage";
import { parseProductMediaStorageKey } from "./storage-key";

export class FilesystemProductMediaStorage implements ProductMediaStorage {
  private readonly root: string;

  constructor(root: string, private readonly publicBaseUrl: string) {
    this.root = resolve(root);
    if (!publicBaseUrl.endsWith("/")) throw new Error("Product media public base URL must end in /.");
  }

  private pathFor(storageKey: string): string {
    parseProductMediaStorageKey(storageKey);
    const path = resolve(this.root, storageKey);
    if (path !== this.root && !path.startsWith(this.root + sep))
      throw new Error("Invalid product media storage key.");
    return path;
  }

  async put(input: PutProductMediaInput): Promise<StoredProductMedia> {
    const parsed = parseProductMediaStorageKey(input.key);
    if (parsed.visibility !== input.visibility) throw new Error("Product media visibility does not match its storage key.");
    const path = this.pathFor(input.key);
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, input.bytes, { flag: "wx", mode: 0o640 });
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
      const existing = await readFile(path);
      if (!existing.equals(input.bytes))
        throw new ProductMediaStorageError("STORAGE_KEY_CONFLICT", "An immutable product media key already contains different bytes.");
    }
    return {
      storageKey: input.key,
      byteSize: input.bytes.length,
      ...(input.visibility === "public" ? { publicUrl: this.publicUrl(input.key) } : {}),
    };
  }

  async read(storageKey: string): Promise<Buffer> {
    try { return await readFile(this.pathFor(storageKey)); }
    catch (error: any) {
      if (error?.code === "ENOENT") throw new ProductMediaStorageError("STORAGE_NOT_FOUND", "Product media object not found.");
      throw error;
    }
  }

  async delete(storageKey: string): Promise<void> {
    try { await unlink(this.pathFor(storageKey)); }
    catch (error: any) { if (error?.code !== "ENOENT") throw error; }
  }

  async exists(storageKey: string): Promise<boolean> {
    try { await access(this.pathFor(storageKey)); return true; }
    catch (error: any) { if (error?.code === "ENOENT") return false; throw error; }
  }

  publicUrl(storageKey: string): string {
    const parsed = parseProductMediaStorageKey(storageKey);
    if (parsed.visibility !== "public") throw new Error("Private product media has no public URL.");
    return this.publicBaseUrl + storageKey.slice("public/".length);
  }
}

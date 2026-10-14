export type ProductMediaVisibility = "private" | "public";

const productIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const storageKeyPattern = /^(private|public)\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/([a-f0-9]{2})\/([a-f0-9]{64})\.webp$/;

export interface ParsedProductMediaStorageKey {
  visibility: ProductMediaVisibility;
  productId: string;
  sha256: string;
}

export function createProductMediaStorageKey(
  productId: string,
  sha256: string,
  visibility: ProductMediaVisibility,
): string {
  if (!productIdPattern.test(productId)) throw new Error("Invalid product media product ID.");
  if (!sha256Pattern.test(sha256)) throw new Error("Invalid product media SHA-256.");
  return `${visibility}/${productId}/${sha256.slice(0, 2)}/${sha256}.webp`;
}

export function parseProductMediaStorageKey(key: string): ParsedProductMediaStorageKey {
  const match = storageKeyPattern.exec(key);
  if (!match || key.includes("..") || key.startsWith("/"))
    throw new Error("Invalid product media storage key.");
  return {
    visibility: match[1] as ProductMediaVisibility,
    productId: match[2],
    sha256: match[4],
  };
}

/** Customer-safe thumbnail from the same published product used by the catalogue. */
export function orderLineImage(product: {published: boolean; image?: string; featuredMedia: {publicUrl: string | null; status: string; archivedAt: Date | null} | null}): string | undefined {
  if (!product.published) return undefined;
  const origin = "https://portal.varietygroceries.com";
  const media = product.featuredMedia;
  if (media && media.status === "approved" && !media.archivedAt && media.publicUrl && media.publicUrl.length <= 512) {
    try {
      const url = new URL(media.publicUrl, origin);
      if (url.origin === origin && !url.username && !url.password && !url.search && !url.hash &&
          /^\/media\/products\/[A-Za-z0-9_/-]+\.(?:png|jpe?g|webp)$/i.test(url.pathname)) return url.href;
    } catch { /* fall back to published catalogue image */ }
  }
  // Legacy catalogue has existing Unsplash photos. Permit only its known photo
  // host and public resizing parameters, never arbitrary external or signed URLs.
  if (!product.image || product.image.length > 512) return undefined;
  try {
    const url = new URL(product.image, origin);
    if (url.username || url.password || url.hash) return undefined;
    if (url.origin === origin && !url.search &&
        /^\/(?:images|products|media\/products)\/[A-Za-z0-9_/-]+\.(?:png|jpe?g|webp)$/i.test(url.pathname)) return url.href;
    if (url.origin !== "https://images.unsplash.com" || !/^\/photo-[A-Za-z0-9-]+$/.test(url.pathname)) return undefined;
    for (const [key, value] of url.searchParams) {
      if (!["auto","fit","w","h","q","crop","fm"].includes(key) || !/^[a-zA-Z0-9,-]{1,24}$/.test(value)) return undefined;
    }
    return url.href;
  } catch { return undefined; }
}

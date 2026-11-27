/** Only expose same-site public product media; never private or signed assets. */
export function orderLineImage(product: {published: boolean; featuredMedia: {publicUrl: string | null; status: string; archivedAt: Date | null} | null}): string | undefined {
  const media = product.featuredMedia;
  if (!product.published || !media || media.status !== "approved" || media.archivedAt || !media.publicUrl || media.publicUrl.length > 512) return undefined;
  try {
    const origin = "https://portal.varietygroceries.com";
    const url = new URL(media.publicUrl, origin);
    if (url.origin !== origin || url.username || url.password || url.search || url.hash ||
        !/^\/media\/products\/[A-Za-z0-9_/-]+\.(?:png|jpe?g|webp)$/i.test(url.pathname)) return undefined;
    return url.href;
  } catch { return undefined; }
}

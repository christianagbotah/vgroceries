/**
 * Decorative add-to-cart motion. The actual Zustand cart change happens
 * BEFORE this function, never as an animation callback or pending promise.
 * Any animation failure must not affect checkout or create another add.
 */
export const CART_IMPACT_EVENT = "vg:cart-impact";

export function announceCartImpact(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CART_IMPACT_EVENT));
}

export function flyProductToCart(
  source: HTMLElement | null,
  image?: HTMLImageElement | null,
): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const isMobile = window.matchMedia?.("(max-width: 767px)")?.matches ?? false;
  const selector = isMobile ? '[data-vg-cart-target="mobile"]' : '[data-vg-cart-target="header"]';
  const target = document.querySelector<HTMLElement>(selector) ??
    document.querySelector<HTMLElement>("[data-vg-cart-target]");
  if (!source || !target || reduceMotion || document.visibilityState === "hidden") {
    announceCartImpact();
    return;
  }

  const startRect = (image ?? source).getBoundingClientRect();
  const endRect = target.getBoundingClientRect();
  if (!startRect.width || !startRect.height || !endRect.width || !endRect.height ||
      typeof document.createElement("div").animate !== "function") {
    announceCartImpact();
    return;
  }

  const width = Math.min(Math.max(startRect.width * .28, 44), 82);
  const startX = startRect.left + startRect.width / 2 - width / 2;
  const startY = startRect.top + startRect.height / 2 - width / 2;
  const endX = endRect.left + endRect.width / 2 - width / 2;
  const endY = endRect.top + endRect.height / 2 - width / 2;
  const node = document.createElement("div");
  node.setAttribute("aria-hidden", "true");
  node.dataset.vgCartFlight = "true";
  Object.assign(node.style, {
    position: "fixed",
    left: startX + "px",
    top: startY + "px",
    width: width + "px",
    height: width + "px",
    zIndex: "9999",
    borderRadius: "22px",
    border: "2px solid rgba(255,255,255,.95)",
    boxShadow: "0 16px 35px rgba(3,57,38,.25)",
    overflow: "hidden",
    pointerEvents: "none",
    background: "#ecf6e6",
    willChange: "transform,opacity",
  } satisfies Partial<CSSStyleDeclaration>);
  if (image?.currentSrc || image?.src) {
    const picture = document.createElement("img");
    picture.src = image.currentSrc || image.src;
    picture.alt = "";
    picture.decoding = "async";
    Object.assign(picture.style, { width: "100%", height: "100%", objectFit: "cover" });
    node.appendChild(picture);
  } else {
    node.textContent = "✦";
    Object.assign(node.style, {
      display: "grid", placeItems: "center", fontSize: "32px", color: "#17663d",
    });
  }

  document.body.appendChild(node);
  const dx = endX - startX;
  const dy = endY - startY;
  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    node.remove();
    announceCartImpact();
  };
  try {
    const animation = node.animate([
      { transform: "translate3d(0,0,0) scale(1)", opacity: 1, offset: 0 },
      { transform: "translate3d(" + dx * .38 + "px," + (dy * .22 - 80) + "px,0) scale(1.15)", opacity: 1, offset: .45 },
      { transform: "translate3d(" + dx + "px," + dy + "px,0) scale(.24)", opacity: .22, offset: 1 },
    ], { duration: 650, easing: "cubic-bezier(.22,.75,.32,1)", fill: "forwards" });
    void animation.finished.then(cleanup, cleanup);
    // The animation is cosmetic: avoid stranded DOM after a suspended tab.
    window.setTimeout(cleanup, 1000);
  } catch {
    cleanup();
  }
}

"use client";

import { useEffect, type RefObject } from "react";

/**
 * Keep the final feedback for an async customer form in view, even when a long
 * form is replaced by a short receipt (which otherwise strands the viewport
 * at the footer via scroll anchoring).
 *
 * Only pass a truthy trigger when a *user-initiated* result is ready; don't
 * use this for periodically refreshed content such as order tracking.
 */
export function useSubmissionFeedbackFocus(
  trigger: unknown,
  targetRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!trigger) return;
    const frame = window.requestAnimationFrame(() => {
      const target = targetRef.current;
      if (!target) return;
      // Focus the confirmation itself for screen readers, without allowing the
      // browser's default focus scrolling to jump to an arbitrary position.
      target.focus({ preventScroll: true });
      target.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto" : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [trigger, targetRef]);
}

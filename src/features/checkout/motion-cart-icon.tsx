"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ShoppingCart } from "lucide-react";
import { CART_IMPACT_EVENT } from "@/features/checkout/cart-motion";

export function MotionCartIcon({ count, mobile = false }: { count: number; mobile?: boolean }) {
  const [impact, setImpact] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const onCartImpact = () => setImpact(value => value + 1);
    window.addEventListener(CART_IMPACT_EVENT, onCartImpact);
    return () => window.removeEventListener(CART_IMPACT_EVENT, onCartImpact);
  }, []);

  return (
    <motion.span
      data-vg-cart-target={mobile ? "mobile" : "header"}
      className="relative inline-flex size-7 items-center justify-center"
      animate={reduced ? undefined : { scale: impact ? [1, 1.32, .92, 1] : 1, rotate: impact ? [0, -10, 6, 0] : 0 }}
      transition={{ duration: .5, type: "tween" }}
      key={impact}
    >
      <ShoppingCart className="size-5" aria-hidden />
      <AnimatePresence initial={false} mode="popLayout">
        {count > 0 ? (
          <motion.span
            key={count}
            initial={reduced ? false : { opacity: 0, scale: .5, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, scale: .6, y: 6 }}
            transition={{ type: "spring", stiffness: 450, damping: 24 }}
            className={
              "absolute -right-2.5 -top-2 grid place-items-center rounded-full bg-primary " +
              "font-black text-white shadow-[0_3px_10px_rgba(16,92,56,.28)] " +
              (mobile ? "min-h-4 min-w-4 px-0.5 text-[9px]" : "min-h-5 min-w-5 px-1 text-[10px]")
            }
          >
            {count > 99 ? "99+" : count}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.span>
  );
}

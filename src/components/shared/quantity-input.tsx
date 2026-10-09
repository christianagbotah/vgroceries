"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Minus, Plus } from "lucide-react";
import { addQty, cmpQty, formatQty } from "@/lib/quantity";
import { useState } from "react";

/** Quantity stepper working on decimal-string quantities. Touch-friendly. */
export function QuantityInput({
  value,
  onChange,
  min = "1",
  max,
  unit,
  disabled,
  ariaLabel,
  size = "md",
}: {
  value: string;
  onChange: (next: string) => void;
  min?: string;
  max?: string;
  unit?: string;
  disabled?: boolean;
  ariaLabel?: string;
  size?: "sm" | "md";
}) {
  const [text, setText] = useState<string | null>(null);
  const step = (dir: 1 | -1) => {
    let next = addQty(value, dir === 1 ? "1" : "-1");
    if (cmpQty(next, min) < 0) next = min;
    if (max && cmpQty(next, max) > 0) next = max;
    if (cmpQty(next, "0") < 0) next = "0";
    onChange(next);
  };
  const btn = size === "sm" ? "size-9" : "size-11";
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={ariaLabel ?? "Quantity"}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={btn}
        onClick={() => step(-1)}
        disabled={disabled || cmpQty(value, min) <= 0}
        aria-label="Decrease quantity"
      >
        <Minus className="size-4" aria-hidden />
      </Button>
      <Input
        type="text"
        inputMode="decimal"
        className={size === "sm" ? "h-9 w-16 text-center" : "h-11 w-20 text-center"}
        value={text ?? formatQty(value)}
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel} value` : "Quantity value"}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== null) {
            const cleaned = text.trim().replace(",", ".");
            if (/^\d+(\.\d{1,3})?$/.test(cleaned)) {
              let next = cleaned;
              if (max && cmpQty(next, max) > 0) next = max;
              if (cmpQty(next, "0") <= 0) next = min;
              onChange(next);
            }
          }
          setText(null);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={btn}
        onClick={() => step(1)}
        disabled={disabled || (max ? cmpQty(value, max) >= 0 : false)}
        aria-label="Increase quantity"
      >
        <Plus className="size-4" aria-hidden />
      </Button>
      {unit ? (
        <Label className="ml-1 text-sm text-muted-foreground font-normal">
          {cmpQty(value, "1") === 0 ? unit.replace(/ies$/, "y") : unit}
        </Label>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import type { OrderLineView } from "@/services/contracts";

export function OrderLinePreview({ line }: { line: OrderLineView }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const url = line.imageUrl;
  const showImage = !!url && url !== failedUrl;
  return (
    <li className="flex items-center gap-3 py-1.5">
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40 sm:size-14">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" width={56} height={56} loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain" onError={() => setFailedUrl(url)} />
        ) : <Package aria-hidden className="size-5 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1 break-words">
        <p className="font-medium">{line.productName}</p>
        <p className="text-xs text-muted-foreground">{line.variantName} × {line.quantity}{line.substitutionOfLineId ? " · substitute" : ""}</p>
      </div>
      <span className="shrink-0 whitespace-nowrap font-medium tabular-nums">{line.lineTotalLabel}</span>
    </li>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Accessible pagination for server-rendered grids. */
export function PaginationNav({ page, pages, buildHref }: { page: number; pages: number; buildHref: (page: number) => string }) {
  const window = 2;
  const numbers: (number | "gap")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= window) numbers.push(i);
    else if (numbers[numbers.length - 1] !== "gap") numbers.push("gap");
  }
  const base = "inline-flex h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm font-medium hover:bg-accent";
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1.5">
      {page > 1 ? (
        <Link href={buildHref(page - 1)} className={base} aria-label="Previous page">
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
      ) : (
        <span className={cn(base, "pointer-events-none opacity-50")} aria-hidden>
          <ChevronLeft className="size-4" />
        </span>
      )}
      {numbers.map((n, i) =>
        n === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-muted-foreground" aria-hidden>…</span>
        ) : (
          <Link
            key={n}
            href={buildHref(n)}
            aria-current={n === page ? "page" : undefined}
            className={cn(base, n === page && "border-primary bg-primary text-primary-foreground hover:bg-primary")}
          >
            {n}
          </Link>
        )
      )}
      {page < pages ? (
        <Link href={buildHref(page + 1)} className={base} aria-label="Next page">
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span className={cn(base, "pointer-events-none opacity-50")} aria-hidden>
          <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  );
}

/** Small text button used under tables to reveal more rows. */
export function LoadMoreButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <div className="mt-3 flex justify-center">
      <Button variant="outline" onClick={onClick} disabled={loading} className="h-11">
        {loading ? "Loading…" : "Load more"}
      </Button>
    </div>
  );
}

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import { PackageOpen, SearchX, TriangleAlert, RefreshCw } from "lucide-react";

/** Loading state for async regions. */
export function LoadingState({ label = "Loading…", rows = 3, className }: { label?: string; rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
      ))}
    </div>
  );
}

/** Empty state with a clear next action. */
export function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick?: () => void; href?: string };
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-10 text-center", className)}>
      <Icon className="size-10 text-muted-foreground/60" aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description ? <p className="text-sm text-muted-foreground max-w-sm">{description}</p> : null}
      </div>
      {action ? (
        action.href ? (
          <Button asChild variant="outline" size="sm">
            <a href={action.href}>{action.label}</a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )
      ) : null}
    </div>
  );
}

/** Error state that states what actually happened and offers a retry. */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4", className)}>
      <div className="flex items-center gap-2 text-destructive">
        <TriangleAlert className="size-5" aria-hidden />
        <p className="font-semibold">{title}</p>
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden /> Try again
        </Button>
      ) : null}
    </div>
  );
}

/** No search results. */
export function NoResults({ query, onClear }: { query: string; onClear?: () => void }) {
  return (
    <EmptyState
      icon={SearchX}
      title={`No matches for “${query}”`}
      description="Try a different word, or browse the categories. Items out of stock are hidden from the shop."
      action={onClear ? { label: "Clear search", onClick: onClear } : undefined}
    />
  );
}
